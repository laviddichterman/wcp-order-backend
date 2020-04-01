const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const OAUTH2_KEYS = require("../authentication/auth");
const logger = require('../logging');
const OAuth2 = google.auth.OAuth2;


const oauth2Client = new OAuth2(
  OAUTH2_KEYS.CLIENT_ID,
  OAUTH2_KEYS.CLIENT_SECRET,
  "https://developers.google.com/oauthplayground"
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});

RefreshAccessToken = () => {
  return oauth2Client.getAccessToken();
}

class GoogleProvider {
  #accessToken;
  #smtpTransport;
  #calendarAPI;
  constructor() {
    this.#accessToken = RefreshAccessToken();
    this.#smtpTransport = nodemailer.createTransport({
      service: "gmail",
      auth: {
           type: "OAuth2",
           user: process.env.EMAIL_ADDRESS, 
           clientId: OAUTH2_KEYS.CLIENT_ID,
           clientSecret: OAUTH2_KEYS.CLIENT_SECRET,
           refreshToken: process.env.GOOGLE_REFRESH_TOKEN
      }
    });
    this.#smtpTransport.set('oauth2_provision_cb', (user, renew, callback) => {
      if (renew) {
        this.#accessToken = RefreshAccessToken();
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
    this.#calendarAPI = google.calendar({version: 'v3', oauth2Client});
  }

  set AccessToken(tkn) {
    this.#accessToken = tkn;
  }
  get AccessToken() {
    return this.#accessToken;
  };

  SendEmail = (to, subject, replyto, htmlbody) => {
    const mailOptions = {
      from: process.env.EMAIL_ADDRESS,
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
        logger.info(response);
      }
      this.#smtpTransport.close();
    });
  };

  CreateCalendarEvent = () => {
    this.#calendarAPI.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const events = res.data.items;
      if (events.length) {
        console.log('Upcoming 10 events:');
        events.map((event, i) => {
          const start = event.start.dateTime || event.start.date;
          console.log(`${start} - ${event.summary}`);
        });
      } else {
        console.log('No upcoming events found.');
      }
    });
  };
  
};

const GOOGLE_PROVIDER = new GoogleProvider();
// refreshes token every 45 minutes
const REFRESH_ACCESS_INTERVAL = setInterval(function() {
  GOOGLE_PROVIDER.AccessToken = RefreshAccessToken();
}, 2700000);

module.exports = GOOGLE_PROVIDER;