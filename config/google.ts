import nodemailer from "nodemailer";
import { GoogleAuth } from 'google-auth-library';
import { google, calendar_v3 } from "googleapis";
import { ExponentialBackoff } from '../utils';
import logger from '../logging';
import OAUTH2_KEYS from "../authentication/auth.json";
import SMTPTransport from "nodemailer/lib/smtp-transport";
const OAuth2 = google.auth.OAuth2;

class GoogleProvider {
  static get GOOGLE_EVENTS_DATETIME_FORMAT() {
    return "yyyy-MM-ddTHH:mm:ss";
  }

  #accessToken : GetAccessTokenResponse | null;
  #smtpTransport : nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  #calendarAPI;
  #sheetsAPI;
  #oauth2Client;
  constructor() {
    this.#oauth2Client = new OAuth2(
      OAUTH2_KEYS.CLIENT_ID,
      OAUTH2_KEYS.CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
    this.#calendarAPI = google.calendar('v3');
    this.#sheetsAPI = google.sheets('v4');
  }

  RefreshAccessToken = async () => {
    try {
      logger.debug("Refreshing Google OAUTH2 access token.");
      this.#accessToken = await this.#oauth2Client.getAccessToken();
    }
    catch (error) {
      logger.error(`Failed to refresh Google access token, got error ${JSON.stringify(error)}`);
    }
  }

  BootstrapProvider = async (db) => {
    const cfg = db.KeyValueConfig;
    if (cfg.GOOGLE_REFRESH_TOKEN && cfg.EMAIL_ADDRESS) {
      logger.debug("Got refresh token from DB config: %o", cfg.GOOGLE_REFRESH_TOKEN);
      this.#oauth2Client.setCredentials({
        refresh_token: cfg.GOOGLE_REFRESH_TOKEN
      });
      await this.RefreshAccessToken();
      // refreshes token every 45 minutes
      const _REFRESH_ACCESS_INTERVAL = setInterval(() => {
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
      this.#smtpTransport.set('oauth2_provision_cb', (_user, renew, callback) => {
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

  SendEmail = async (from, to, subject, replyto, htmlbody, attachments=[], retry=0, max_retry=5) => {    
    const mailOptions = {
      from: from,
      to: to,
      subject: subject,
      generateTextFromHTML: true,
      replyTo: replyto,
      html: htmlbody,
      attachments
    };
    const call_fxn = async () => {
      try { 
        const res = await this.#smtpTransport.sendMail(mailOptions);
        logger.debug(`Sent mail with subject ${subject} to ${to}`);
        return res;
      }
      catch (error) { 
        logger.error(`Email of ${JSON.stringify(mailOptions)} not sent, got error: ${error}`);
        //this.#smtpTransport.close(); not sure if this is needed or not?
        throw error;
      }
    }
    return await ExponentialBackoff(call_fxn, () => true, retry, max_retry);
  };

  CreateCalendarEvent = async (
    summary : string, 
    location : string, 
    description : string, 
    start : calendar_v3.Schema$EventDateTime, 
    end : calendar_v3.Schema$EventDateTime, 
    retry=0, 
    max_retry=5) => {
    const eventjson = {
      summary: summary,
      location: location,
      description: description,
      start: start,
      end: end
    };
    const call_fxn = async () => {
      try { 
        const event = await this.#calendarAPI.events.insert({
          auth: this.#oauth2Client,
          calendarId: 'primary',
          requestBody: eventjson
        });
        logger.debug("Created event: %o", event);
        return event;
      }
      catch (err) {
        logger.error("event not created: %o", eventjson);
        logger.error(err);
        throw (err);
      }  
    }
    return await ExponentialBackoff(call_fxn, () => true, retry, max_retry);
  };

  GetEventsForDate = async (min_date : string, max_date : string, tz : string) => {
    const res = await this.#calendarAPI.events.list({
      auth: this.#oauth2Client,
      calendarId: 'primary',
      timeMin: min_date,
      timeMax: max_date,
      timeZone: tz,
      maxResults: 2500
    });
    return(res.data.items);
  }

  AppendToSheet = async (sheetId : string, range : string, fields: any[]) => {
    const res = await this.#sheetsAPI.spreadsheets.values.append({
      auth: this.#oauth2Client,
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        majorDimension: "ROWS",
        values: [fields]
      }
    });
    return(res.data);
  }

  GetValuesFromSheet = async (sheetId : string, range : string) => {
    const res = await this.#sheetsAPI.spreadsheets.values.get({
      auth: this.#oauth2Client,
      spreadsheetId: sheetId,
      range: range,
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
      majorDimension: "ROWS",
    });
    return(res.data);
  };

  UpdateValuesInSheet = async (sheetId : string, range : string, fields : any[]) => {
    const res = await this.#sheetsAPI.spreadsheets.values.update({
      auth: this.#oauth2Client,
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        majorDimension: "ROWS",
        values: [fields]
      }
    });
    return(res.data);
  }

};

const GOOGLE_PROVIDER = new GoogleProvider();

module.exports = GOOGLE_PROVIDER;