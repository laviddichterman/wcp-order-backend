import nodemailer from "nodemailer";
import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from 'google-auth-library';
import { ExponentialBackoff } from '../utils';
import logger from '../logging';
import SMTPTransport from "nodemailer/lib/smtp-transport";
import Mail from "nodemailer/lib/mailer";
import { DataProviderInstance } from "./dataprovider";
import { WProvider } from '../types/WProvider';
const OAuth2 = google.auth.OAuth2;

export class GoogleProvider implements WProvider {

  #accessToken: string;
  #smtpTransport : nodemailer.Transporter<SMTPTransport.SentMessageInfo>;
  #calendarAPI;
  #sheetsAPI;
  #oauth2Client: OAuth2Client;
  constructor() {
    this.#calendarAPI = google.calendar("v3");
    this.#sheetsAPI = google.sheets('v4');
  }

  RefreshAccessToken = async () => {
    try {
      const token = await this.#oauth2Client.getAccessToken();
      logger.debug(`Refreshing Google OAUTH2 access token to ${token.token}`);
      this.#accessToken = token.token!;
    }
    catch (error) {
      logger.error(`Failed to refresh Google access token, got error ${JSON.stringify(error)}`);
    }
  }

  Bootstrap = async () => {
    // this bootstrapping requires having used https://developers.google.com/oauthplayground/ to get a refresh token.
    // 1. Go to https://developers.google.com/oauthplayground/
    // 2. set scopes to https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://mail.google.com/
    // 3. Click on the gear icon, and check "Use your own OAuth credentials"
    // 4. Enter the client ID and client secret from the Google Cloud Console
    // 5. Click "Authorize APIs" and use the account you want to send emails from
    // 6. Click "Exchange authorization code for tokens"
    // In the future, this should be changed to handle Oauth2 via the UI or to use a service account.
    logger.debug("Bootstrapping GoogleProvider");
    const cfg = DataProviderInstance.KeyValueConfig;
    this.#oauth2Client = new OAuth2(
      cfg.GOOGLE_CLIENTID,
      cfg.GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground"
    );
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
          clientId: cfg.GOOGLE_CLIENTID,
          clientSecret: cfg.GOOGLE_CLIENT_SECRET,
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
    logger.info(`Finished Bootstrap of GoogleProvider`);
  }

  get AccessToken() {
    return this.#accessToken;
  };

  SendEmail = async (from : string | Mail.Address, to : string | Mail.Address, subject : string, replyto : string, htmlbody : string, attachments : Mail.Attachment[] = [], retry=0, max_retry=5) => {    
    const mailOptions : Mail.Options = {
      from: from,
      to: to,
      subject: subject,
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

  CreateCalendarEvent = async ( eventJson: calendar_v3.Schema$Event,
    retry=0, 
    max_retry=5) => {
    const call_fxn = async () => {
      try { 
        const event = await this.#calendarAPI.events.insert({
          auth: this.#oauth2Client,
          calendarId: 'primary',
          requestBody: eventJson
        });
        logger.debug("Created event: %o", event);
        return event;
      }
      catch (err) {
        logger.error("event not created: %o", event);
        logger.error(err);
        throw (err);
      }  
    }
    return await ExponentialBackoff(call_fxn, () => true, retry, max_retry);
  };

  DeleteCalendarEvent = async ( eventId: string,
    retry=0, 
    max_retry=5) => {
    const call_fxn = async () => {
      try { 
        await this.#calendarAPI.events.delete({
          auth: this.#oauth2Client,
          calendarId: 'primary',
          eventId: eventId
        });
        logger.debug(`Deleted event: ${eventId}`);
        return true;
      }
      catch (err) {
        logger.error(`Event not deleted, got error: ${err}`);
        throw (err);
      }  
    }
    return await ExponentialBackoff(call_fxn, () => true, retry, max_retry);
  };

  ModifyCalendarEvent = async ( eventId: string, sparseEvent: Partial<Omit<calendar_v3.Schema$Event, 'id'>>,
    retry=0, 
    max_retry=5) => {
    const call_fxn = async () => {
      try { 
        const response = await this.#calendarAPI.events.patch({
          auth: this.#oauth2Client,
          calendarId: 'primary',
          eventId: eventId,
          requestBody: sparseEvent
        });
        logger.debug(`Patched event: ${eventId}, updated fields: ${JSON.stringify(sparseEvent, null, 2)}`);
        return response;
      }
      catch (err) {
        logger.error(`Event not updated, got error: ${err}`);
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
export const GoogleProviderInstance = new GoogleProvider();
