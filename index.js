const express = require("express");
const cors = require("cors");
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
var html_to_pdf = require("html-pdf-node");

const dbUri = process.env.MONGO_URI;
let ACCOUNTS,
  PLANS,
  SUBSCRIPTIONS,
  ROLES,
  DRAWS = [],
  ACTIVE = {},
  //powerspinstats is an array which every index represents the stats for the first,second and third roulette
  POWERSPIN_STATS = [
    { delays: { numbers: [], Red: 0, Green: 0, Blue: 0, Symbol: 0 } },
    { delays: { numbers: [], Red: 0, Green: 0, Blue: 0, Symbol: 0 } },
    { delays: { numbers: [], Red: 0, Green: 0, Blue: 0, Symbol: 0 } },
  ];

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 9000;

app.use(express.static(path.join(__dirname, "/public")));

//----------------getting all the new powerspin draws
(async () => {
  powerspinDraws(DRAWS, POWERSPIN_STATS, ACTIVE);
})();
//-----------------

//-----------------------connecting to database
(async () => {
  const client = await MongoClient.connect(dbUri, {
    useNewUrlParser: true,
  }).catch((err) => {
    console.log(err);
  });
  console.log("connected!");
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
  /*const jokerActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/5104/active"
  );*/
  const jokerResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/5104/last-result-and-active"
  );
  /*const lottoActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/5103/last-result-and-active"
  );*/
  const lottoResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/5103/last-result-and-active"
  );
  /*const protoActive = await axios.get(
    "https://api.opap.gr/draws/v3.0/2101/last-result-and-active"
  );*/
  const protoResult = await axios.get(
    "https://api.opap.gr/draws/v3.0/2101/last-result-and-active"
  );
  return {
    joker: jokerResult.data,
    lotto: lottoResult.data,
    proto: protoResult.data,
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

app.get("/file", (req, res) => {
  let options = { format: "A4" };
  // Example of options with args //
  // let options = { format: 'A4', args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  /*
  let file = {
    content: `<style>.jackpot-con{
      --width: 775px;
      width:var(--width);
      height:calc(var(--width)*1.4142);
      color: black !important;
      background-color: white;
      border-radius: 1vh;
      font-size: calc(var(--width)*0.075);
      overflow: hidden;
  }
  .jackpot-logo{
      width:100%;
      height:12.5%;
  }
  .title-con{
      display: flex;
      justify-content: space-around   ;
      align-items: center;
      height:15%;
  }
  
  .draw-info{
      display: flex;
      flex-direction: column;
  }
  .draw-info div{
      color: black !important;
  
  }
  .draw-day-con td{
      font-size: calc(var(--width)*0.030);
      color: black !important;
      padding: 0 5vh 0 5vh;
      border:1px solid black;
  
  }
  .tzoker-day-con div,div{
      font-size: calc(var(--width)*0.05);
  }
  .info{
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: calc(var(--width)*0.05);
      height:5%;
      color: black !important;
  }
  .draw-numbers{
      display: flex;
      justify-content: space-around;
      align-items: center;
      height:10%;
      border: 1px solid black;
  }
  .draw-numbers div{
      color: red !important;
      font-size: calc(var(--width)*0.1);
  }
  .draw-results{
      height:30%;
      width:100%;
      table-layout: fixed;
  }
  .draw-results th{
      color: BLACK !important;
      border: 1px solid black;
      font-size: calc(var(--width)*0.02);
      text-align: center;
  }
  .draw-results td{
      font-size: calc(var(--width)*0.035);
      color: BLACK !important;
      border: 1px solid black;
      text-align: center;
  }
  .jackpot-prize{
      height: 12.5%;
      display: flex;
      align-items: center;
      justify-content: center;
      width:100%;
      color:red !important;
      font-size: calc(var(--width)*0.175);
      font-weight: 900;
  }
  .jackpot-footer{
      display: flex;
      justify-content: center;
      align-items: center;
      width:99%;
      height:9%;
      color: black !important;
      font-size: calc(var(--width)*0.025);
      text-align:center; border:2px solid black;}</style><div class="jackpot-con" id="joker"><img src="data:image/png;base64,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" class="jackpot-logo"><div class="title-con"><table class="draw-day-con"><thead></thead><tbody><tr><td>ΤΡΙΤΗ</td><td>V</td></tr><tr><td>ΠΕΜΠΤΗ</td><td>V</td></tr><tr><td>ΚΥΡΙΑΚΗ</td><td>V</td></tr></tbody></table><div class="draw-info"><div>ΚΛΗΡΩΣΗ: 2454</div><div>ΤΗΣ: 04/08/2022</div></div></div><div class="info">ΑΡΙΘΜΟΙ ΠΟΥ ΚΛΗΡΩΘΗΚΑΝ</div><div class="draw-numbers"><div>1</div><div>2</div><div>5</div><div>10</div><div>20</div><div>+</div><div>20</div></div><div class="info">ΑΠΟΤΕΛΕΣΜΑΤΑ ΔΙΑΛΟΓΗΣ</div><table class="draw-results"><tbody><tr><th>ΚΑΤΗΓΟΡΙΕΣ ΕΠΙΤΥΧΙΩΝ</th><th>ΣΩΣΤΕΣ ΠΡΟΒΛΕΨΕΙΣ</th><th>ΕΠΙΤΥΧΙΕΣ</th><th>ΚΕΡΔΟΣ ΑΝΑ ΕΠΙΤΥΧΙΑ</th></tr><tr><td>I</td><td>6</td><td>1.500.000 €</td><td>0 €</td></tr><tr><td>II</td><td>5+1</td><td>0</td><td>0 €</td></tr><tr><td>III</td><td>5</td><td>4</td><td>1.500 €</td></tr><tr><td>IV</td><td>4</td><td>447</td><td>30,00 €</td></tr><tr><td>V</td><td>3</td><td>8887</td><td>1,50 €</td></tr></tbody></table><div class="jackpot-prize">16.000.000 €</div><div class="jackpot-footer">ΤΟΥΛΑΧΙΣΤΟΝ ΘΑ ΜΟΙΡΑΣΤΟΥ ΟΙ ΤΥΧΕΡΟΙ ΝΙΚΗΤΕΣ ΤΗΣ Ι ΚΑΤΗΓΟΡΙΑΣ ΣΤΗΝ ΕΠΟΜΕΝΗ ΚΛΗΡΩΣΗ</div></div>`,
      
  };
*/
  html_to_pdf.generatePdf(file, options).then((pdfBuffer) => {
    res.contentType("application/pdf");
    res.send(pdfBuffer);
  });
});

app.post("/draws", verifyToken, async (req, res) => {
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

  res.status(200).json({ active: ACTIVE, last: DRAWS });
});

app.post("/draw", verifyToken, async (req, res) => {
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

  res.status(200).json({ active: ACTIVE, last: DRAWS[0] });
});

app.post("/powerspinStats", async (req, res) => {
  res.status(200).json({ active: ACTIVE, last: POWERSPIN_STATS });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "/public/index.html"));
});

const server = app.listen(port, async () => {
  console.log(`App listening at http://localhost:${port}`);
});
