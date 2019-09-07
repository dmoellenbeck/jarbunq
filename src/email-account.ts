// EmailAccount

import BaseEvents = require("./base-events")
import {EmailActionRule, ProcessedEmail} from "./types"

const _ = require("lodash")
const database = require("./database")
const imap = require("imap")
const mailparser = require("mailparser")
const moment = require("moment")
const logger = require("anyhow")
let settings

/**
 * Represents a single IMAP mail account.
 */
class EmailAccount extends BaseEvents {
    /** Default EmailAccount constructor. */
    constructor(id: string, config: any) {
        super()

        settings = require("setmeup").settings
        this.id = id
        this.config = config

        logger.info("EmailAccount", id, config.host)
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** ID of this email account. */
    id: string

    /** IMAP account configuration. */
    config: any

    /** IMAP connection client. */
    client: any

    /** Cache of email message IDs. */
    messageIds: any

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Start parsing relevant messages on the mail server.
     * @event start
     */
    start(): void {
        this.messageIds = {}

        this.client = new imap(this.config)
        this.openBox(true)

        this.events.emit("start")
    }

    /**
     * Stops parsing messages on the mail server.
     * @event stop
     */
    stop(): void {
        try {
            this.client.closeBox()
            this.client.end()
            this.client = null
        } catch (ex) {
            logger.error("EmailAccount.stop", this.id, ex)
        }

        this.events.emit("stop")
    }

    // METHODS
    // --------------------------------------------------------------------------

    /**
     * Opens the mailbox.
     * @param retry When true it will retry opening the mailbox if failed.
     */
    openBox(retry: boolean): void {
        if (this.client && this.client.state == "authenticated") {
            return logger.warn("EmailAccount.openBox", this.id, "Already connected. Abort.")
        }

        // Once IMAP is ready, open the inbox and start listening to messages.
        this.client.once("ready", () => {
            this.client.openBox(this.config.inboxName, false, err => {
                if (err) {
                    logger.warn("EmailAccount.openBox", this.id, err)

                    // Auth failed? Do not try again.
                    if (err.textCode == "AUTHORIZATIONFAILED") {
                        return logger.error("EmailAccount.openBox", this.id, "Auth failed, please check user and password")
                    }

                    // Retry connection?
                    if (retry) {
                        return _.delay(this.openBox, settings.email.retryInterval, false)
                    }

                    return logger.error("EmailAccount.openBox", this.id, "Failed to connect")
                } else {
                    logger.info("EmailAccount.openBox", this.id, "Inbox ready")

                    // Start fetching unseen messages immediately.
                    const since = moment().subtract(settings.email.fetchHours, "hours")
                    this.fetchMessages(since.toDate())
                    this.client.on("mail", () => this.fetchMessages())
                }
            })
        })

        // Handle IMAP errors. If disconnected because of connection reset, call openBox again.
        this.client.on("error", err => {
            logger.error("EmailAccount.openBox.onError", this.id, err)

            if (err.code == "ECONNRESET") {
                return _.delay(this.openBox, settings.imap.retryInterval, true)
            }
        })

        // Connect to the IMAP server.
        return this.client.connect()
    }

    /**
     * Fetch new unread messages for the specified account.
     * @param since Optional date, if not specified will fetch new / unseen messages.
     */
    fetchMessages(since?: Date): void {
        let query = since ? ["SINCE", since] : "UNSEEN"

        return this.client.search([query], (err, results) => {
            if (err) {
                return logger.error("EmailAccount.fetchMessages", this.id, err)
            }

            if (results == null || results.length < 1) {
                return logger.info("EmailAccount.fetchMessages", this.id, "No new messages")
            }

            const fetcher = this.client.fetch(results, {size: true, struct: true, markSeen: false, bodies: ""})
            fetcher.on("message", msg => this.downloadMessage(msg))
            fetcher.once("error", err => logger.error("EmailAccount.fetchMessages.onError", this.id, err))

            logger.info("EmailAccount.fetchMessages", this.id, `${results.length} new message(s)`)
        })
    }

    /**
     * Download the specified message and load the related Email Action.
     * @param rawMessage The unprocessed, raw message
     */
    downloadMessage(rawMessage): void {
        let parserCallback = async (err, parsedMessage) => {
            if (err) {
                return logger.error("EmailAccount.downloadMessage", this.id, err)
            }

            try {
                // We don't need the brackets on the message ID.
                parsedMessage.messageId = parsedMessage.messageId.replace(/\</g, "").replace(/\>/g, "")

                logger.debug("EmailAccount.downloadMessage", parsedMessage.messageId, parsedMessage.from, parsedMessage.subject, `To ${parsedMessage.to}`)

                // Only process message if we haven't done it before (in case message goes back to inbox).
                if (!this.messageIds[parsedMessage.messageId] && parsedMessage) {
                    await this.processEmail(parsedMessage)
                }
            } catch (ex) {
                return logger.error("EmailAccount.downloadMessage", ex.message, ex.stack)
            }
        }

        // Get message attributes and body chunks, and on end proccess the message.
        rawMessage.on("body", stream => mailparser.simpleParser(stream, parserCallback))
    }

    /**
     * Process the specified message against the rules defined on the settings.
     * @param message The downloaded email message
     */
    async processEmail(message: any): Promise<void> {
        logger.debug("EmailAccount.processEmail", message.messageId, message.from, message.subject, `To ${message.to}`)

        let processedEmail: ProcessedEmail = null

        // Iterate rules.
        for (let r of settings.email.rules) {
            let rule = r as EmailActionRule
            let actionModule, from

            try {
                actionModule = require("./email-actions/" + rule.action)
                from = message.from.value[0].address.toLowerCase()

                // Get default rule from action.
                if (actionModule.defaultRule != null) {
                    rule = _.defaultsDeep(rule, actionModule.defaultRule)
                }
            } catch (ex) {
                logger.error("EmailAccount.processEmail", this.id, `Action ${rule.action}`, message.messageId, ex)
                continue
            }

            // At least one property must be defined on the rule.
            let valid = message.from || message.subject || message.body

            if (!valid) {
                logger.error("EmailAccount.processEmail", this.id, `Action ${rule.action}`, message.messageId, "Rule must have at least a from, subject or body specified")
                continue
            }

            // Make sure rule definitions are arrays.
            for (const field of ["from", "subject", "body"]) {
                if (rule[field] != null && _.isString(rule[field])) {
                    rule[field] = [rule[field]]
                }
            }

            // Check if email comes from one of the specified senders.
            if (rule.from) {
                valid = false

                for (const value of rule.from) {
                    if (from.indexOf(value) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Check if email subject contains a specified string.
            if (rule.subject) {
                valid = false

                for (const value of rule.subject) {
                    if (message.subject.toLowerCase().indexOf(value.toLowerCase()) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Check if email body contains a specified string.
            if (rule.body) {
                valid = false

                for (const value of rule.body) {
                    if (message.text.indexOf(value) >= 0) {
                        valid = true
                    }
                }
                if (!valid) {
                    continue
                }
            }

            // Extra validation on incoming messages. Must have
            // at least 3 out of 7 possible security features.
            if (settings.email.checkSecurity) {
                let securityCount = 0

                if (message.headers.has("received-spf") && message.headers.get("received-spf").includes("pass")) {
                    securityCount++
                }

                // Check for authentication results header, or via ARC.
                if (message.headers.has("authentication-results")) {
                    const authResults = message.headers.get("authentication-results")
                    if (authResults.includes("spf=pass")) {
                        securityCount++
                    }
                    if (authResults.includes("dkim=pass")) {
                        securityCount++
                    }
                } else if (message.headers.has("arc-authentication-results")) {
                    const arcAuthResults = message.headers.get("arc-authentication-results")
                    if (arcAuthResults.includes("spf=pass")) {
                        securityCount++
                    }
                    if (arcAuthResults.includes("dkim=pass")) {
                        securityCount++
                    }
                }

                // Check for ARC seal.
                if (message.headers.has("arc-seal")) {
                    securityCount++
                }

                // Check for security scan.
                if (message.headers.has("x-cloud-security-sender") && rule.from.indexOf(message.headers.get("x-cloud-security-sender")) > 0) {
                    securityCount++
                }

                // Less than 3 security features? Quit processing here.
                if (securityCount < 3) {
                    return logger.error("EmailAccount", this.id, message.messageId, message.subject, "Message did not pass the security checks")
                }
            }

            if (processedEmail == null) {
                processedEmail = {
                    messageId: message.messageId,
                    from: message.from,
                    subject: message.subject,
                    date: moment().toDate(),
                    actions: []
                }
            }

            // Information to be logged about the current rule.
            let logRule = []
            for (let [key, value] of Object.entries(rule)) {
                if (_.isArray(value)) {
                    logRule.push(`${key}=${(value as any).join(" ")}`)
                } else {
                    logRule.push(`${key}=${value}`)
                }
            }

            // Action!
            try {
                const resultError = await actionModule(message, rule)

                if (resultError != null && resultError != false) {
                    processedEmail.actions[rule.action] = resultError
                    logger.warn("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, resultError)
                } else {
                    processedEmail.actions[rule.action] = true
                    logger.info("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, message.subject, "Processed")
                }
            } catch (ex) {
                logger.error("EmailAccount.processEmail", this.id, logRule.join(", "), message.messageId, ex)
            }
        }

        // Add to database in case email had any action.
        if (processedEmail != null) {
            database.insert("processedEmails", processedEmail)
            this.events.emit("processEmail", processedEmail)
        }
    }
}

// Exports...
export = EmailAccount
