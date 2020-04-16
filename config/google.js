const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const OAUTH2_KEYS = require("../authentication/auth");
const logger = require('../logging');
const OAuth2 = google.auth.OAuth2;

class GoogleProvider {
  static get GOOGLE_EVENTS_DATETIME_FORMAT() {
    return "YYYY-MM-DDTHH:mm:ss";
  }

  #accessToken;
  #smtpTransport;
  #calendarAPI;
  #oauth2Client;
  constructor() {
    this.#oauth2Client = new OAuth2(
      OAUTH2_KEYS.CLIENT_ID,
      OAUTH2_KEYS.CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    this.#calendarAPI = google.calendar('v3');
  }

  RefreshAccessToken = () => {
    this.#accessToken = this.#oauth2Client.getAccessToken();
  }

  BootstrapProvider = (db) => {
    const cfg = db.KeyValueConfig;
    if (cfg.GOOGLE_REFRESH_TOKEN && cfg.EMAIL_ADDRESS) {
      logger.debug("Got refresh token from DB config: %o", cfg.GOOGLE_REFRESH_TOKEN);
      this.#oauth2Client.setCredentials({
        refresh_token: cfg.GOOGLE_REFRESH_TOKEN
      });
      this.RefreshAccessToken();
      // refreshes token every 45 minutes
      const REFRESH_ACCESS_INTERVAL = setInterval(() => {
        this.RefreshAccessToken();
      }, 2700000);

      logger.debug("Got EMAIL_ADDRESS from DB config: %o", cfg.EMAIL_ADDRESS);
      this.#smtpTransport = nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: cfg.EMAIL_ADDRESS,
          clientId: OAUTH2_KEYS.CLIENT_ID,
          clientSecret: OAUTH2_KEYS.CLIENT_SECRET,
          refreshToken: cfg.GOOGLE_REFRESH_TOKEN
        }
      });
      this.#smtpTransport.set('oauth2_provision_cb', (user, renew, callback) => {
        if (renew) {
          this.RefreshAccessToken();
        }
        if (!this.#accessToken) {
          logger.error("Fucked up the access token situation!");
          return callback(new Error("Done fukt up."));
        }
        else {
          logger.info("Access token: %o", this.#accessToken);
          return callback(null, this.#accessToken);
        }
      });
    }
    else {
      logger.warn("CANT DO IT BRO");
    }
  }

  get AccessToken() {
    return this.#accessToken;
  };

  SendEmail = (from, to, subject, replyto, htmlbody) => {
    const mailOptions = {
      from: from,
      to: to,
      subject: subject,
      generateTextFromHTML: true,
      replyTo: replyto,
      html: htmlbody
    };
    this.#smtpTransport.sendMail(mailOptions, (error, response) => {
      if (error) {
        logger.error(error);
      }
      else {
        logger.info(`Sent mail with subject ${subject} to ${to}`);
      }
      this.#smtpTransport.close();
    });
  };

  CreateCalendarEvent = (summary, location, description, start, end) => {
    const eventjson = {
      summary: summary,
      location: location,
      description: description,
      start: start,
      end: end
    };
    this.#calendarAPI.events.insert({
      auth: this.#oauth2Client,
      calendarId: 'primary',
      resource: eventjson
    }, (err, event) => {
      if (err) {
        logger.error("event not created: %o", eventjson);
        logger.error(err);
        throw (err);
      }
      else {
        logger.info("Created event: %o", event);
      }
    });
  };

  GetEventsForDate = async (min_date, max_date, tz) => {
    const res = await this.#calendarAPI.events.list({
      auth: this.#oauth2Client,
      calendarId: 'primary',
      timeMin: min_date,
      timeMax: max_date,
      timeZone: tz,
      maxResults: 2500
    });
    console.log(JSON.stringify(res));
    return(res.data.items);
  }

};

const GOOGLE_PROVIDER = new GoogleProvider();

module.exports = GOOGLE_PROVIDER;