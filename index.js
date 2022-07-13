const express = require("express");
const TokenGenerator = require("uuid-token-generator");
var bcrypt = require("bcrypt");
var jwt = require("jsonwebtoken");
require("dotenv").config();
const verifyToken = require("./verifyToken");
const MongoClient = require("mongodb").MongoClient;
const uri = process.env.MONGO_URI;
let ACCOUNTS;

const app = express();
app.use(express.json());
const port = process.env.PORT || 9000;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

client.connect(async (err) => {
  ACCOUNTS = client.db("praktoras").collection("accounts");
});

app.use(express.static("public"));

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
  if (!db_user) return res.status(400).json({ token: -1 });

  if (!(await bcrypt.compare(user.password, db_user.password)))
    return res.status(400).json({ token: -1 });

  const token = jwt.sign(
    { username: db_user.username },
    process.env.TOKEN_SECRET,
    {
      expiresIn: "2h",
    }
  );
  res.status(200).json({ token, message: "User Found" });
});

app.post("/check", verifyToken, (req, res) => {
  console.log(req.user);
  res.status(200).json({ message: "hello" });
});

const server = app.listen(port, async () => {
  console.log(`App listening at http://localhost:${port}`);
});
