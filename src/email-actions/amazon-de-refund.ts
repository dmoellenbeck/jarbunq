// Amazon Refund Email Action
// This will process refunds from Amazon.de and automatically transfer the
// money from the Amazon Card to the Main account.

import {PaymentOptions} from "../types"
import logger = require("anyhow")
const settings = require("setmeup").settings

// Email parsing strings.
const arrTotalText = ["Refund total:"]
const arrItemText = ["Item details:"]

// Helper to cleanup amount text.
const amountCleanup = function(value) {
    value = value.replace("EUR", "").replace(":", "")
    value = value.replace(".", "").replace(",", ".")
    return value.trim()
}

// Exported function.
const EmailAction = async (message: any): Promise<any> => {
    logger.debug("EmailAction.AmazonDeRefund", message.messageId, message.from, message.subject, `To ${message.to}`)

    let amount, description, itemDescription, partial

    try {
        let totalIndex = -1
        let itemIndex = -1

        // Find where the total order is defined on the email plain text.
        for (let totalText of arrTotalText) {
            if (totalIndex < 0) {
                totalIndex = message.text.indexOf(totalText)

                if (totalIndex >= 0) {
                    partial = message.text.substring(totalIndex + totalText.length)
                    break
                }
            }
        }

        // Stop if refund amount was not found.
        if (partial == null || partial == "") {
            return {error: "Can't find refund amount on the email body"}
        }

        partial = partial.substring(0, partial.indexOf("\n"))

        // Only proceed if order was made in euros.
        if (!partial.includes("EUR")) {
            return {error: "Refund amount not in EUR"}
        }

        // Get actual total amount.
        amount = amountCleanup(partial)

        // Parsing failed?
        if (isNaN(amount)) {
            return {error: "Could not find correct refund amount"}
        }

        amount = parseFloat(amount)

        // Order has no amount (downloads for example)?
        if (amount < 0.01) {
            return {error: "Refund amount is 0"}
        }

        // Set transaction description based on order details.
        for (let itemText of arrItemText) {
            if (itemIndex < 0) {
                itemIndex = message.text.indexOf(itemText)

                if (itemIndex >= 0) {
                    partial = message.text.substring(itemIndex + itemText.length)
                    partial = partial.substring(0, partial.indexOf("\n\n")).replace(":", "")
                    partial = partial.replace("=20", "")
                    break
                }
            }
        }

        if (itemIndex < 0) {
            itemDescription = "unknown item(s)"
        } else {
            itemDescription = partial.trim()
        }

        // Get order number and description.
        description = `Refund for ${itemDescription}, ${amount} EUR`

        // Set payment options.
        const paymentOptions: PaymentOptions = {
            amount: amount.toFixed(2),
            description: description,
            fromAlias: settings.bunq.accounts.amazon,
            toAlias: settings.bunq.accounts.main,
            draft: true
        }

        return paymentOptions
    } catch (ex) {
        throw ex
    }
}

// Default rule for amazon-de-refund action.
EmailAction.defaultRule = {
    from: "rueckgabe@amazon.de",
    subject: "Your refund",
    body: "complete"
}

// Exports...
export = EmailAction