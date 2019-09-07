// Webhooks

import logger = require("anyhow")
const request = require("request-promise-native")
const settings = require("setmeup").settings

/**
 * Central management of webhooks to dispatch events from
 * Jarbunq to external systems via REST calls.
 */
class Webhooks {
    private static _instance: Webhooks
    static get Instance() {
        return this._instance || (this._instance = new this())
    }

    // PROPERTIES
    // --------------------------------------------------------------------------

    /** Holds a copy of all registered webhook listeners. */
    listeners: any[] = []

    // MAIN METHODS
    // --------------------------------------------------------------------------

    /**
     * Init the webhooks handler by loading them from settings.
     */
    async init() {
        this.load()
    }

    // WEBHOOKS
    // --------------------------------------------------------------------------

    /**
     * Load webhooks defined on the settings.
     */
    load = () => {
        if (this.listeners.length > 0) {
            logger.info("Webhooks.load", `Stopping ${this.listeners.length} registered webhooks before reload`)

            for (let cb of this.listeners) {
                require(`./${cb.module}`).off(cb.key, cb.method)
            }
        }

        // Reset listeners.
        this.listeners = []

        // Each subkey of the webhooks on settings represent a module.
        const moduleIds = Object.keys(settings.webhooks)

        // Iterate modules, function names and webhook definitions.
        for (let id of moduleIds) {
            try {
                let obj = require(`./${id}`)
                let moduleEvents = settings.webhooks[id]
                let eventNames = Object.keys(moduleEvents)

                for (let evt of eventNames) {
                    for (let webhook of moduleEvents[evt]) {
                        logger.info("Webhooks.load", id, evt, `Registered ${webhook.url}`)

                        let callback = async function() {
                            let options: any = {
                                uri: webhook.url,
                                method: webhook.method ? webhook.method : "POST",
                                json: true,
                                resolveWithFullResponse: true
                            }

                            try {
                                if (options.method == "POST") {
                                    options.body = Array.from(arguments)
                                }

                                // Request and log response.
                                let response = await request(options)
                                logger.info("Webhooks", id, evt, options.method, webhook.url, response.body)
                            } catch (ex) {
                                logger.error("Webhooks", id, evt, options.method, webhook.url, ex)
                            }
                        }

                        obj.on(evt, callback)
                        this.listeners.push(callback)
                    }
                }
            } catch (ex) {
                logger.error("Webhooks.load", id, ex)
            }
        }

        logger.info("Webhooks.load", `Loaded ${this.listeners.length} webhooks`)
    }
}

// Exports...
export = Webhooks.Instance
