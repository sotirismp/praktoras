const express = require("express");
const TokenGenerator = require("uuid-token-generator");
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

  res.status(200).json({ info: req.user, subs: [...formattedSubs] });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/index.html"));
});

const server = app.listen(port, async () => {
  console.log(`App listening at http://localhost:${port}`);
});
