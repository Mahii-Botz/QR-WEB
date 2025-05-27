const express = require("express");
const fs = require("fs");
const { Boom } = require("@hapi/boom");
const P = require("pino");
const qrcode = require("qrcode");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require("@whiskeysockets/baileys");
const { File } = require("megajs");

const app = express();
const PORT = 8000;

let qrCodeData = null;
let currentSocket = null;

app.use(express.static("public"));

app.get("/qr", (req, res) => {
  if (!qrCodeData)
    return res.send("QR not ready. Please refresh in a moment.");
  res.send(`
    <html>
      <body>
        <center>
          <h1>Scan QR to Login</h1>
          <img src="${qrCodeData}" />
        </center>
      </body>
    </html>
  `);
});

async function connectToWhatsApp() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState("./auth_info_baileys");

  const sock = makeWASocket({
  version,
  logger: P({ level: "silent" }),
  browser: Browsers.macOS("Safari"),
  auth: state,
});

  currentSocket = sock;

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
    }

    if (connection === "open") {
      console.log("✅ WhatsApp Connected");
      qrCodeData = null;

      // Small delay to make sure creds saved before upload
      setTimeout(async () => {
        try {
          const file = new File({
            name: "creds.json",
            data: fs.readFileSync("./auth_info_baileys/creds.json"),
          });

          const upload = await file.upload();
          const link = upload.link();
          const id = link.split("/").pop();

          // Send MEGA session ID to yourself via WhatsApp
          const number = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          await sock.sendMessage(number, {
            text: `✅ Session uploaded to MEGA\n🆔 Your SESSION_ID: ${id}`,
          });

          console.log("☁️ Session uploaded and sent to WhatsApp.");
        } catch (e) {
          console.error("Failed to upload session to MEGA:", e);
        }
      }, 3000);
    }

    if (
      connection === "close" &&
      (lastDisconnect.error instanceof Boom || lastDisconnect?.error)
    ) {
      const shouldReconnect =
        lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔄 Reconnecting to WhatsApp...");
        connectToWhatsApp();
      } else {
        console.log("❌ Logged out. Please delete auth_info_baileys folder and re-scan QR.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}/qr`);
  connectToWhatsApp();
});
