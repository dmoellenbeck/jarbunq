/**
 * Used to send notifications to users.
 */
declare class Notifications {
    private static _instance;
    static readonly Instance: Notifications;
    /** SMTP client created via Nodemailer. */
    smtp: any;
    /**
     * Init the notifications module.
     */
    init(): Promise<void>;
    /**
     * Sends an email via SMTP.
     * @param options Email sending options with to, subject, body etc.
     */
    toEmail: (options: EmailOptions) => Promise<void>;
}
/**
 * Defines email sending options.
 */
interface EmailOptions {
    /** The email subject. */
    subject: string;
    /** The actual message to be sent. */
    message?: string;
    /** The sender email address. If unspecified, will use defaul from settings. */
    from?: string;
    /** The target email address. */
    to?: string;
    /** The actual HTML to be sent out (filled automatically during send, by using template + message). */
    html?: string;
}
declare const _default: Notifications;
export = _default;
