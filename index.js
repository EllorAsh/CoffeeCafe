import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import session from "express-session";
import env from "dotenv";

env.config();

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
})
db.connect();
const app = express();
const port = 3000;

app.use(express.static("./public"));

app.get("/", async(req, res)=>{
    const reviewsdb =await GetReviews();
    res.render("home.ejs",{
        reviews: reviewsdb,
    })
})

app.get("/home", async(req, res)=>{
    const reviewsdb =await GetReviews();
    res.render("home.ejs", {
        reviews: reviewsdb,
    })
})

app.listen(port, ()=>{
    console.log("Server running on port "+ port);
})


// functions

async function GetReviews() {
    let reviews=[]
    const result = await db.query("SELECT * FROM review")
    result.rows.forEach((review)=>{
        reviews.push(review)
    })
    console.log(reviews)
    return reviews
}
