const express = require("express");
const TokenGenerator = require("uuid-token-generator");
const { JSDOM } = require("jsdom");
const axios = require("axios");
var bcrypt = require("bcrypt");
const path = require("path");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const verifyToken = require("./verifyToken");
const powerspinDraws = require("./powerspinDraws");
const dbUri = process.env.MONGO_URI;
let ACCOUNTS,
  PLANS,
  SUBSCRIPTIONS,
  ROLES,
  DRAWS = [],
  ACTIVE = {};

const app = express();
app.use(express.json());
const port = process.env.PORT || 9000;

app.use(express.static(path.join(__dirname, "/public")));

//----------------getting all the new powerspin draws
(async () => {
  powerspinDraws(DRAWS, ACTIVE);
})();
//-----------------

//-----------------------connecting to database
(async () => {
  const client = await MongoClient.connect(dbUri, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });
  const db = client.db("praktoras");
  ACCOUNTS = db.collection("accounts");
  PLANS = db.collection("plans");
  SUBSCRIPTIONS = db.collection("subscriptions");
  ROLES = db.collection("roles");
})();
//-----------------------------------

app.use(function (req, res, next) {
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  next();
});

async function getLaiko() {
  let response = await axios.get("https://www.laheia.gr/el/web/laheia/home");
  let response2 = await axios.get(
    "https://www.laheia.gr/lotoswebservice/laikoBanner"
  );
  const dom = new JSDOM(response.data);
  let x = dom.window.document
    .querySelectorAll(".portlet-borderless-container")[2]
    .children[0].children[0].innerHTML.split(" ");
  let xx = x[1].split("=");
  let xxx = xx[1].split(";");
  let laiko_jackpot = xxx[0];
  return {
    game: "laiko",
    jackpot: laiko_jackpot,
    next_draw: response2.data.next_draw_time,
    url: response2.data.url,
    date_now: Date.now(),
  };
}

async function getJackpots() {
  const jokerActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/5104/active"
  );
  const jokerResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/5104/last-result-and-active"
  );
  const lottoActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/5103/last-result-and-active"
  );
  const lottoResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/5103/last-result-and-active"
  );
  const protoActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/2101/last-result-and-active"
  );
  const protoResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/2101/last-result-and-active"
  );
  return {
    joker: [jokerActive.data, jokerResult.data],
    lotto: [lottoActive.data, lottoResult.data],
    proto: [protoActive.data, protoResult.data],
  };

  /*
  let response = await fetch("https://api.opap.gr/draws/v3.0/5104/active");
  let response2 = await fetch(
    "https://api.opap.gr/draws/v3.0/5104/last-result-and-active"
  );
  let joker_json = await response.json();
  let joker_json2 = await response2.json();
  response = await fetch("https://api.opap.gr/draws/v3.0/5103/active");
  response2 = await fetch(
    "https://api.opap.gr/draws/v3.0/5103/last-result-and-active"
  );
  let lotto_json = await response.json();
  let lotto_json2 = await response2.json();
  response = await fetch("https://api.opap.gr/draws/v3.0/2101/active");
  response2 = await fetch(
    "https://api.opap.gr/draws/v3.0/2101/last-result-and-active"
  );
  let proto_json = await response.json();
  let proto_json2 = await response2.json();
  return {
    joker_json,
    joker_json2,
    lotto_json,
    lotto_json2,
    proto_json,
    proto_json2,
  };*/
}

app.post("/login", async (req, res) => {
  const tokgen2 = new TokenGenerator(256, TokenGenerator.BASE62);
  const user = req.body;

  if (user.username && user.username == null)
    return res.status(400).json({ token: -1 });

  var myobj = { username: user.username.toLowerCase().trim() };

  let db_user = await ACCOUNTS.findOne(myobj);
  if (!db_user || !(await bcrypt.compare(user.password, db_user.password)))
    return res
      .status(400)
      .json({ token: -1, message: "Λάθος στοιχεία εισόδου." });

  const token = jwt.sign(
    { username: db_user.username },
    process.env.TOKEN_SECRET,
    {
      expiresIn: "2h",
    }
  );

  res
    .status(200)
    .json({ token, username: db_user.username, message: "User Found" });
});

app.post("/userInfo", verifyToken, async (req, res) => {
  let cursor = await SUBSCRIPTIONS.find({ username: req.user.username });
  let subs = await cursor.toArray();

  for (let i = 0; i < subs.length; i++) {
    let plan = await PLANS.findOne({ plan_id: subs[i].plan_id });
    subs[i].name = plan.name;
  }

  let filteredSubs = subs.filter((e) => {
    if (e.sub_start < Date.now() && e.sub_end > Date.now()) {
      return { _id: e._id, name: e.name, start: e.sub_start, end: e.sub_end };
    }
  });

  let formattedSubs = filteredSubs.map((e) => {
    return { _id: e._id, name: e.name, start: e.sub_start, end: e.sub_end };
  });

  res.status(200).json({
    info: req.user,
    subs: [...formattedSubs],
  });
});

app.post("/laiko", verifyToken, async (req, res) => {
  res.status(200).json(await getLaiko());
});

app.post("/jackpots", verifyToken, async (req, res) => {
  let sub = await SUBSCRIPTIONS.findOne({
    username: req.user.username,
    plan_id: "jackpots",
  });

  if (!sub)
    return res
      .status(400)
      .json({ message: "Δεν έχετε συνδρομή στην υπηρεσία" });

  if (Date.now() > sub.sub_end)
    return res.status(400).json({ message: "Η συνδρομή σας έχει λήξει" });

  return res.status(200).json({ data: await getJackpots(), message: "Κομπλέ" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/index.html"));
});

const server = app.listen(port, async () => {
  console.log(`App listening at http://localhost:${port}`);
});
