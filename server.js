
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const Stripe = require("stripe");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const PORT = process.env.PORT || 5000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const publicDir = path.join(__dirname, "public");
const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;
const paymentCurrency = String(process.env.STRIPE_CURRENCY || "usd").toLowerCase();
function getAppBaseUrl() {
  const configured = String(process.env.APP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  if (IS_VERCEL && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${PORT}`;
}

// Stripe needs the unparsed request body to verify webhook signatures.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Serve frontend assets from public/.
app.use(express.static(publicDir));

// =====================================================
// TRAILER UPLOAD
// Local development supports disk uploads.
// Vercel production temporarily disables local uploads.
// Use cloud object storage for permanent production uploads.
// =====================================================

const trailerDir = path.join(__dirname, "public", "uploads", "trailers");

// Local computer par upload directory create karo.
// Vercel par local filesystem mein upload folder create mat karo.
if (process.env.NODE_ENV !== "production" && !IS_VERCEL) {
  fs.mkdirSync(trailerDir, { recursive: true });
}

const localTrailerUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, trailerDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(
        null,
        `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`
      );
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^video\/(mp4|webm|ogg|quicktime|x-msvideo)$/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Please upload a video file (MP4, WebM, OGG, MOV or AVI)."));
  }
});

// Vercel can parse admin form fields but must not persist uploads on its
// ephemeral filesystem. A hosted trailer URL remains supported there.
const vercelTrailerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^video\/(mp4|webm|ogg|quicktime|x-msvideo)$/.test(file.mimetype)) return cb(null, true);
    cb(new Error("Please upload a video file (MP4, WebM, OGG, MOV or AVI)."));
  }
}).single("trailerFile");

const trailerUpload = IS_VERCEL
  ? (req, res, next) => vercelTrailerUpload(req, res, (err) => {
      if (err) return next(err);
      if (req.file) {
        return res.status(501).json({
          error: "Trailer file upload storage is not configured on Vercel. Use a hosted trailer URL."
        });
      }
      next();
    })
  : localTrailerUpload.single("trailerFile");


const movieSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  year: { type: Number, default: 2024 },
  genre: { type: String, default: "Drama" },
  rating: { type: Number, default: 4.0, min: 0, max: 5 },
  description: { type: String, default: "" },
  poster: { type: String, default: "" },
  language: { type: String, default: "Hindi" },
  director: { type: String, default: "" },
  cast: { type: String, default: "" },
  trailerUrl: { type: String, default: "" },
  // Keep downloadable licensed media in a private object-storage bucket.
  downloadKey: { type: String, default: "", select: false },
  downloadPriceCents: { type: Number, default: 0, min: 0 },
  downloadCurrency: { type: String, default: "usd", lowercase: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

movieSchema.index({ title: "text", genre: 1 });

const Movie = mongoose.model("Movie", movieSchema, "movies");

// =====================================================
// DEMO MOVIES — used only when MongoDB is disconnected
// =====================================================

const demoMovies = [
  {
    _id: "demo1",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    rating: 4.8,
    language: "English",
    description: "A team of explorers travel beyond this galaxy to discover whether mankind has a future among the stars.",
    poster: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"
  },
  {
    _id: "demo2",
    title: "Inception",
    year: 2010,
    genre: "Thriller",
    rating: 4.7,
    language: "English",
    description: "A skilled thief enters dreams to steal secrets, but his toughest mission is planting an idea.",
    poster: "https://image.tmdb.org/t/p/w500/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"
  },
  {
    _id: "demo3",
    title: "3 Idiots",
    year: 2009,
    genre: "Comedy",
    rating: 4.8,
    language: "Hindi",
    description: "Three engineering students discover friendship, purpose and the courage to follow their passion.",
    poster: "https://image.tmdb.org/t/p/w500/66A9MqXOyVFCssoloscw79z8Tew.jpg"
  },
  {
    _id: "demo4",
    title: "Dangal",
    year: 2016,
    genre: "Drama",
    rating: 4.6,
    language: "Hindi",
    description: "A former wrestler trains his daughters to become world-class wrestlers against every expectation.",
    poster: "https://image.tmdb.org/t/p/w500/whEM7qjV3e2jW9b6n7f4lV4v1rK.jpg"
  },
  {
    _id: "demo5",
    title: "The Dark Knight",
    year: 2008,
    genre: "Action",
    rating: 4.9,
    language: "English",
    description: "Batman faces a criminal mastermind who pushes Gotham into chaos and tests its limits.",
    poster: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg"
  },
  {
    _id: "demo6",
    title: "Zindagi Na Milegi Dobara",
    year: 2011,
    genre: "Drama",
    rating: 4.5,
    language: "Hindi",
    description: "Three friends take a road trip across Spain that changes how they see life and each other.",
    poster: "https://image.tmdb.org/t/p/w500/1W1W7Er6a9D9fK3Qf5fXv3mXwQ.jpg"
  },
  {
    _id: "demo7",
    title: "Spider-Man: Into the Spider-Verse",
    year: 2018,
    genre: "Animation",
    rating: 4.7,
    language: "English",
    description: "Miles Morales discovers that anyone can wear the mask in a dazzling multiverse adventure.",
    poster: "https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg"
  },
  {
    _id: "demo8",
    title: "Drishyam",
    year: 2015,
    genre: "Thriller",
    rating: 4.5,
    language: "Hindi",
    description: "A resourceful family man uses his love of cinema and sharp instincts to protect his family.",
    poster: "https://image.tmdb.org/t/p/w500/6s6j6f6f6f6f6f6f6f6f6f6f6f6.jpg"
  }
];

// =====================================================
// USER MODEL
// =====================================================

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: { type: String, required: true },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: "Movie" }],
  role: { type: String, enum: ["user"], default: "user" },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

const purchaseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: "Movie", required: true, index: true },
  stripeSessionId: { type: String, required: true, unique: true },
  paymentIntentId: { type: String, default: "" },
  amountCents: { type: Number, required: true, min: 1 },
  currency: { type: String, required: true, lowercase: true },
  purchasedAt: { type: Date, default: Date.now }
});
const Purchase = mongoose.model("Purchase", purchaseSchema);

function publicMovie(movie) {
  const result = movie.toObject ? movie.toObject() : { ...movie };
  delete result.downloadKey;
  result.downloadAvailable = Boolean(movie.downloadKey || movie.downloadAvailable);
  result.downloadPriceCents = Number(movie.downloadPriceCents || 0);
  result.downloadCurrency = String(movie.downloadCurrency || paymentCurrency).toLowerCase();
  return result;
}

function validDownloadKey(key) {
  return typeof key === "string" && key.length <= 500 &&
    /^[A-Za-z0-9_./ -]+$/.test(key) && !key.startsWith("/") &&
    !key.split("/").some((part) => part === ".." || part === ".");
}

// =====================================================
// AUTHENTICATION HELPERS
// =====================================================

const tokenSecret =
  process.env.TOKEN_SECRET ||
  "change-this-token-secret-before-deployment-please";

function signToken(payload) {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    })
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", tokenSecret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) return null;

    const expected = crypto
      .createHmac("sha256", tokenSecret)
      .update(body)
      .digest();

    const actual = Buffer.from(signature, "base64url");

    if (
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8")
    );

    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    ""
  );

  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ error: "Please log in first." });
  }

  req.auth = payload;
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.auth.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }
    next();
  });
}

function passwordHash(
  password,
  salt = crypto.randomBytes(16).toString("hex")
) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function passwordMatches(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;

    const expected = Buffer.from(hash, "hex");
    const actual = crypto.scryptSync(password, salt, 64);

    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

function safeEqualStrings(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));

  return (
    aa.length === bb.length &&
    crypto.timingSafeEqual(aa, bb)
  );
}

// =====================================================
// REGISTER
// =====================================================

app.post("/api/auth/register", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Connect MongoDB before registering."
    });
  }

  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({
      error: "Name must be 2–80 characters."
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      error: "Enter a valid email address."
    });
  }

  if (password.length < 8 || password.length > 128) {
    return res.status(400).json({
      error: "Password must be at least 8 characters."
    });
  }

  try {
    const user = await User.create({
      name,
      email,
      passwordHash: passwordHash(password)
    });

    const token = signToken({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: "user"
    });

    res.status(201).json({
      token,
      user: {
        name: user.name,
        email: user.email,
        role: "user"
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    console.error("Registration error:", err);
    res.status(500).json({ error: "Could not create account." });
  }
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  const adminEmail = String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

  const adminPassword = String(process.env.ADMIN_PASSWORD || "");

  if (
    adminEmail &&
    adminPassword &&
    safeEqualStrings(email, adminEmail) &&
    safeEqualStrings(password, adminPassword)
  ) {
    const token = signToken({
      id: "admin",
      name: "Administrator",
      email: adminEmail,
      role: "admin"
    });

    return res.json({
      token,
      user: {
        name: "Administrator",
        email: adminEmail,
        role: "admin"
      }
    });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Connect MongoDB before user login."
    });
  }

  try {
    const user = await User.findOne({ email });

    if (!user || !passwordMatches(password, user.passwordHash)) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const token = signToken({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: "user"
    });

    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
        role: "user"
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Could not log in." });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: {
      name: req.auth.name,
      email: req.auth.email,
      role: req.auth.role
    }
  });
});

// =====================================================
// PAID DOWNLOADS, PURCHASE LIBRARY, AND WISHLIST
// =====================================================

const s3Bucket = String(process.env.S3_BUCKET || "").trim();
let s3Client;
function getS3Client() {
  if (!s3Bucket || !process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("Private download storage is not configured.");
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });
  }
  return s3Client;
}

async function recordPaidCheckout(session) {
  if (mongoose.connection.readyState !== 1 || session.payment_status !== "paid" || session.mode !== "payment") return false;
  const { userId, movieId, amountCents, currency } = session.metadata || {};
  if (!mongoose.isValidObjectId(userId) || !mongoose.isValidObjectId(movieId)) return false;
  const amount = Number(amountCents);
  if (!Number.isSafeInteger(amount) || amount < 50 || amount !== Number(session.amount_total)) return false;
  if (!currency || String(currency).toLowerCase() !== String(session.currency || "").toLowerCase()) return false;
  const movie = await Movie.findById(movieId).select("downloadKey downloadPriceCents downloadCurrency");
  if (!movie || !movie.downloadKey || movie.downloadPriceCents !== amount || movie.downloadCurrency !== String(currency).toLowerCase()) return false;

  await Purchase.updateOne(
    { stripeSessionId: session.id },
    { $setOnInsert: {
      userId,
      movieId,
      stripeSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "",
      amountCents: amount,
      currency: String(currency).toLowerCase(),
      purchasedAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000)
    } },
    { upsert: true }
  );
  return true;
}

app.post("/api/payments/checkout", requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Payments are not configured yet." });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB must be connected before checkout." });
  if (req.auth.role !== "user" || !mongoose.isValidObjectId(req.auth.id)) return res.status(403).json({ error: "A customer account is required." });
  if (!validMovieId(req.body.movieId)) return res.status(400).json({ error: "Choose a valid movie." });

  try {
    const movie = await Movie.findById(req.body.movieId).select("+downloadKey title downloadPriceCents downloadCurrency");
    if (!movie || !movie.downloadKey) return res.status(404).json({ error: "This movie has no licensed download asset configured." });
    if (!validDownloadKey(movie.downloadKey)) return res.status(409).json({ error: "The movie download asset is not configured safely." });
    if (!Number.isInteger(movie.downloadPriceCents) || movie.downloadPriceCents < 50) return res.status(409).json({ error: "This movie does not have a valid download price." });
    if (!/^[a-z]{3}$/.test(movie.downloadCurrency)) return res.status(409).json({ error: "This movie does not have a valid currency." });
    const alreadyOwned = await Purchase.exists({ userId: req.auth.id, movieId: movie._id });
    if (alreadyOwned) return res.status(409).json({ error: "You already own this movie. Open your library to download it.", owned: true });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(req.auth.id),
      customer_email: req.auth.email,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: movie.downloadCurrency,
          unit_amount: movie.downloadPriceCents,
          product_data: { name: `${movie.title} — licensed digital download` }
        }
      }],
      metadata: {
        userId: String(req.auth.id),
        movieId: String(movie._id),
        amountCents: String(movie.downloadPriceCents),
        currency: movie.downloadCurrency
      },
      success_url: `${getAppBaseUrl()}/account.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getAppBaseUrl()}/#movies`
    });
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Create checkout error:", err.message);
    res.status(502).json({ error: "Could not start checkout. Check the payment configuration and try again." });
  }
});

app.post("/api/payments/webhook", async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send("Payment webhook is not configured.");
  }
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).send("MongoDB is unavailable; retry the webhook later.");
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Invalid webhook signature: ${err.message}`);
  }
  try {
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
      const recorded = await recordPaidCheckout(event.data.object);
      if (!recorded) return res.status(400).send("Paid checkout could not be verified.");
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Payment webhook processing error:", err.message);
    res.status(500).send("Webhook processing failed.");
  }
});

app.get("/api/payments/confirm/:sessionId", requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Payments are not configured yet." });
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.metadata?.userId !== String(req.auth.id)) return res.status(404).json({ error: "Checkout session not found." });
    if (session.payment_status === "paid") await recordPaidCheckout(session);
    const purchase = await Purchase.findOne({ stripeSessionId: session.id, userId: req.auth.id }).lean();
    res.json({ paid: Boolean(purchase), status: session.payment_status });
  } catch (err) {
    console.error("Confirm checkout error:", err.message);
    res.status(400).json({ error: "Could not confirm this checkout." });
  }
});

app.get("/api/account/library", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (req.auth.role !== "user") return res.json([]);
  try {
    const purchases = await Purchase.find({ userId: req.auth.id })
      .sort({ purchasedAt: -1 })
      .populate({ path: "movieId", select: "title year genre rating poster language downloadPriceCents downloadCurrency" })
      .lean();
    res.json(purchases.filter((purchase) => purchase.movieId).map((purchase) => ({
      id: String(purchase._id),
      purchasedAt: purchase.purchasedAt,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
      movie: { ...purchase.movieId, _id: String(purchase.movieId._id) }
    })));
  } catch (err) {
    console.error("Load account library error:", err.message);
    res.status(500).json({ error: "Could not load your library." });
  }
});

app.get("/api/account/wishlist", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (req.auth.role !== "user") return res.json([]);
  try {
    const user = await User.findById(req.auth.id).populate({ path: "wishlist", select: "title year genre rating poster language" }).lean();
    res.json((user?.wishlist || []).map((movie) => ({ ...movie, _id: String(movie._id) })));
  } catch (err) {
    console.error("Load wishlist error:", err.message);
    res.status(500).json({ error: "Could not load your watchlist." });
  }
});

app.post("/api/account/wishlist/:movieId", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (req.auth.role !== "user") return res.status(403).json({ error: "A customer account is required." });
  if (!validMovieId(req.params.movieId)) return res.status(400).json({ error: "Choose a valid movie." });
  try {
    const exists = await Movie.exists({ _id: req.params.movieId });
    if (!exists) return res.status(404).json({ error: "Movie not found." });
    await User.updateOne({ _id: req.auth.id }, { $addToSet: { wishlist: req.params.movieId } });
    res.json({ saved: true });
  } catch (err) {
    console.error("Save wishlist item error:", err.message);
    res.status(500).json({ error: "Could not save this movie." });
  }
});

app.delete("/api/account/wishlist/:movieId", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (req.auth.role !== "user") return res.status(403).json({ error: "A customer account is required." });
  if (!validMovieId(req.params.movieId)) return res.status(400).json({ error: "Choose a valid movie." });
  try {
    await User.updateOne({ _id: req.auth.id }, { $pull: { wishlist: req.params.movieId } });
    res.json({ saved: false });
  } catch (err) {
    console.error("Remove wishlist item error:", err.message);
    res.status(500).json({ error: "Could not remove this movie." });
  }
});

app.get("/api/movies/:movieId/download", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "MongoDB is not connected." });
  if (req.auth.role !== "user") return res.status(403).json({ error: "A customer account is required." });
  if (!validMovieId(req.params.movieId)) return res.status(400).json({ error: "Choose a valid movie." });
  try {
    const [movie, purchase] = await Promise.all([
      Movie.findById(req.params.movieId).select("+downloadKey title"),
      Purchase.findOne({ userId: req.auth.id, movieId: req.params.movieId }).lean()
    ]);
    if (!purchase) return res.status(403).json({ error: "Purchase this movie before downloading it." });
    if (!movie || !validDownloadKey(movie.downloadKey)) return res.status(404).json({ error: "The licensed download file is unavailable." });
    const client = getS3Client();
    const extension = path.posix.extname(movie.downloadKey);
    const fileBase = String(movie.title || "movie").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "movie";
    const filename = `${fileBase}${extension}`;
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: movie.downloadKey,
      ResponseContentDisposition: `attachment; filename="${filename}"`
    });
    const downloadUrl = await getSignedUrl(client, command, { expiresIn: 90 });
    res.json({ downloadUrl, expiresIn: 90 });
  } catch (err) {
    console.error("Create secure download link error:", err.message);
    res.status(503).json({ error: err.message === "Private download storage is not configured." ? err.message : "Could not prepare the download. Please try again." });
  }
});

// =====================================================
// DATABASE HEALTH CHECK
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    databaseName: mongoose.connection.name || null,
    moviesCollection: Movie.collection.name
  });
});

// =====================================================
// GET MOVIES
// =====================================================

app.get("/api/movies", async (req, res) => {
  try {
    const {
      search = "",
      genre = "All",
      sort = "recommended"
    } = req.query;

    if (mongoose.connection.readyState !== 1) {
      let result = demoMovies.filter((movie) => {
        const searchableText =
          `${movie.title} ${movie.genre} ${movie.language}`.toLowerCase();

        return (
          searchableText.includes(String(search).toLowerCase()) &&
          (genre === "All" || movie.genre === genre)
        );
      });

      if (sort === "rating") result.sort((a, b) => b.rating - a.rating);
      if (sort === "year") result.sort((a, b) => b.year - a.year);

      return res.json(result.map(publicMovie));
    }

    const filter = {};

    if (genre && genre !== "All") {
      filter.genre = genre;
    }

    if (search) {
      const safeSearch = String(search).slice(0, 100);
      const escapedSearch = safeSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filter.$or = [
        { title: { $regex: escapedSearch, $options: "i" } },
        { genre: { $regex: escapedSearch, $options: "i" } },
        { language: { $regex: escapedSearch, $options: "i" } }
      ];
    }

    let query = Movie.find(filter);

    if (sort === "rating") {
      query = query.sort({ rating: -1 });
    } else if (sort === "year") {
      query = query.sort({ year: -1 });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const movies = await query.select("+downloadKey").limit(100).lean();

    console.log("MongoDB database:", mongoose.connection.name);
    console.log("MongoDB collection:", Movie.collection.name);
    console.log("Movies found:", movies.length);

    res.json(movies.map(publicMovie));
  } catch (err) {
    console.error("GET /api/movies error:", err);
    res.status(500).json({ error: "Could not load movies." });
  }
});

// =====================================================
// ADD MOVIE (ADMIN)
// =====================================================

app.post(
  "/api/movies",
  requireAdmin,
  trailerUpload,
  async (req, res) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "Connect MongoDB first to save movies."
      });
    }

    try {
      const {
        title,
        year,
        genre,
        rating,
        description,
        poster,
        language,
        director,
        cast,
        trailerUrl,
        downloadPriceCents = 0,
        downloadCurrency = paymentCurrency,
        downloadKey = ""
      } = req.body;

      if (!String(title || "").trim()) {
        return res.status(400).json({
          error: "Movie title is required."
        });
      }

      const normalizedDownloadKey = String(downloadKey || "").trim();
      const parsedDownloadPrice = Number(downloadPriceCents || 0);
      const normalizedCurrency = String(downloadCurrency || paymentCurrency).toLowerCase();
      if (normalizedDownloadKey && !validDownloadKey(normalizedDownloadKey)) {
        return res.status(400).json({ error: "Use a valid private S3 object key without path traversal." });
      }
      if (normalizedDownloadKey && (!Number.isInteger(parsedDownloadPrice) || parsedDownloadPrice < 50)) {
        return res.status(400).json({ error: "A downloadable movie must have a price of at least 50 minor currency units." });
      }
      if (!normalizedDownloadKey && parsedDownloadPrice !== 0) {
        return res.status(400).json({ error: "Add a private download asset key or set the download price to zero." });
      }
      if (!/^[a-z]{3}$/.test(normalizedCurrency)) {
        return res.status(400).json({ error: "Download currency must be a three-letter ISO code." });
      }

      // Local upload is supported only outside Vercel.
      const savedTrailerUrl = req.file
        ? `/uploads/trailers/${req.file.filename}`
        : String(trailerUrl || "").trim();

      const movie = await Movie.create({
        title,
        year,
        genre,
        rating,
        description,
        poster,
        language,
        director,
        cast,
        trailerUrl: savedTrailerUrl,
        downloadKey: normalizedDownloadKey,
        downloadPriceCents: parsedDownloadPrice,
        downloadCurrency: normalizedCurrency
      });

      res.status(201).json(publicMovie(movie));
    } catch (err) {
      console.error("Add movie error:", err);
      res.status(400).json({
        error: err.message || "Invalid movie details."
      });
    }
  }
);

// =====================================================
// UPDATE MOVIE RATING
// =====================================================

app.patch("/api/movies/:id/rating", requireAuth, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: "Ratings can be saved after MongoDB is connected."
    });
  }

  try {
    const rating = Number(req.body.rating);

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating must be between 1 and 5."
      });
    }

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { rating },
      { new: true, runValidators: true }
    );

    if (!movie) {
      return res.status(404).json({ error: "Movie not found." });
    }

    res.json(movie);
  } catch (err) {
    console.error("Update rating error:", err);
    res.status(400).json({
      error:
        "Could not update rating. Demo cards cannot be rated until movies are stored in MongoDB."
    });
  }
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE"
      ? (IS_VERCEL
          ? "Trailer file uploads are not enabled on Vercel. Use a hosted trailer URL."
          : "Trailer is too large. Maximum size is 100 MB.")
      : err.message;

    return res.status(400).json({ error: message });
  }

  if (err && /Please upload a video file/.test(err.message || "")) {
    return res.status(400).json({ error: err.message });
  }

  console.error("Unhandled server error:", err);

  if (res.headersSent) return next(err);

  res.status(500).json({
    error: "An unexpected server error occurred."
  });
});

// =====================================================
// HOMEPAGE
// Avoid a catch-all route that may mask missing files.
// Static assets and existing HTML files are served by express.static.
// =====================================================

app.get("/", (req, res) => {
  const indexPath = path.join(publicDir, "index.html");

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("Homepage file error:", err);
      if (!res.headersSent) {
        res.status(500).send("Homepage file could not be loaded.");
      }
    }
  });
});

// =====================================================
// NOT FOUND
// =====================================================

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "API endpoint not found." });
  }

  res.status(404).send("Page not found.");
});

// =====================================================
// START SERVER
// =====================================================

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
      });

      console.log("MongoDB connected");
      console.log("Database:", mongoose.connection.name);
      console.log("Movies collection:", Movie.collection.name);
    } catch (err) {
      console.error("MongoDB connection failed:", err.message);
      console.error("Error name:", err.name);

      if (err.reason?.servers) {
        for (const [address, server] of err.reason.servers) {
          console.error("MongoDB server:", address);
          console.error(
            "Server error:",
            server.error?.message || "No specific error"
          );
        }
      }

      console.error("Server is starting without MongoDB.");
    }
  } else {
    console.warn("MONGODB_URI is not set.");
  }

  // Vercel manages the HTTP server for its deployment.
  // For local development, start listening on PORT.
  if (!IS_VERCEL) {
    app.listen(PORT, () => {
      console.log(`MovieFlix running at http://localhost:${PORT}`);
    });
  }
}

// Export the Express app for Vercel's serverless runtime.
module.exports = app;

// Start the connection for both local and Vercel deployments.
start().catch((err) => {
  console.error("Application startup error:", err);
  if (!IS_VERCEL) process.exitCode = 1;
});
