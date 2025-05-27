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
const { upload } = require("./mega"); // Updated to use your fixed uploader

const app = express();
const PORT = 8000;

let qrCodeData = null;
let currentSocket = null;

// Serve static files from the public folder
app.use(express.static("public"));

// Endpoint to return the QR code image
app.get("/qr-code", async (req, res) => {
  if (!qrCodeData) return res.status(503).send("QR not ready");
  res.send(qrCodeData);
});

// WhatsApp + MEGA Integration
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

      setTimeout(async () => {
        try {
          const link = await upload("./auth_info_baileys/creds.json", "creds.json");
          const id = link.split("/").pop();

          const number = sock.user.id.split(":")[0] + "@s.whatsapp.net";
          await sock.sendMessage(number, {
            text: `✅ Session uploaded to MEGA\n🆔 Your SESSION_ID: ${id}`,
          });

          console.log("☁️ Session uploaded and sent to WhatsApp.");
        } catch (err) {
          console.error("❌ Failed to upload session to MEGA:", err);
        }
      }, 3000);
    }

    if (
      connection === "close" &&
      (lastDisconnect?.error instanceof Boom || lastDisconnect?.error)
    ) {
      const shouldReconnect =
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log("🔄 Reconnecting to WhatsApp...");
        connectToWhatsApp();
      } else {
        console.log("❌ Logged out. Delete auth_info_baileys folder and re-scan QR.");
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  connectToWhatsApp();
});
