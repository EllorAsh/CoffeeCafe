import express from "express";
import pg from "pg";
import bodyParser from "body-parser";
import env from "dotenv";

import session from "express-session";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";

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
const saltRounds = 10;
const taxPercentage=15;

app.use(express.static("./public"));
app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
    })
);
app.use(bodyParser.urlencoded({extended:true}));
app.use(passport.initialize());
app.use(passport.session());

app.get("/", async(req, res)=>{
    res.render("/login.ejs")
})

app.get("/home", async(req, res)=>{
  if(req.isAuthenticated()){
    const userId = req.user.id;
    const reviewsdb =await GetReviews();
    const cartItems = await GetCartCount(userId);
    res.render("home.ejs", {
        reviews: reviewsdb,
        cartItems:cartItems,
    })
  }else{
    res.redirect("/login")
  }
})

app.post("/home", async(req, res)=>{
  if(req.isAuthenticated()){
    const userId = req.user.id;
    const reviewRating = req.body.rating;
    const reviewContent = req. body.reviewContent;
    await LeaveReview(reviewContent, reviewRating);
    const reviewsdb =await GetReviews();
    const cartItems = await GetCartCount(userId);
    res.render("home.ejs", {
        reviews: reviewsdb,
        cartItems:cartItems,
    })
  }else{
    res.redirect("/login")
  }
})

app.get("/menu", async(req, res)=>{
  if(req.isAuthenticated()){
    const userId = req.user.id;
    const coffeeItems = await getItemsOfCategory("coffee")
    const teaItems = await getItemsOfCategory("tea")
    const coldDrinks = await getItemsOfCategory("cold")
    const hotDrinks = await getItemsOfCategory("hot")
    const dessertItems = await getItemsOfCategory("dessert")
    const foodItems = await getItemsOfCategory("food")
    const cartItems = await GetCartCount(userId);
    res.render("menu.ejs", {
        coffee:coffeeItems,
        tea:teaItems,
        cold:coldDrinks,
        hot:hotDrinks,
        dessert:dessertItems,
        food:foodItems,
        cartItems:cartItems,
    })
  }else{
    res.redirect("/login")
  }
})

app.post("/itemView", async(req, res)=>{
  if(req.isAuthenticated()){
    const itemId=req.body.itemId;
    const userId = req.user.id;
    const item= await GetItem(itemId);
    console.log(item)
    if(req.body.type =="order"){
      let milkType = "X"
      if(await NeedsMilk(itemId)){
        milkType= req.body.milk;
      }
      await AddToOrder(userId,itemId, milkType)
      const cartItems = await GetCartCount(userId);
      res.render("itemView.ejs",{
        item:item,
        cartItems:cartItems,
      })
    }else{
      const cartItems = await GetCartCount(userId);
      res.render("itemView.ejs",{
        item:item,
        cartItems:cartItems,
      })
    }
  }else{
    res.redirect("/login")
  }
})

app.get("/cart", async(req, res)=>{
  if(req.isAuthenticated()){
    const userId = req.user.id;
    const cartItems = await GetCartCount(userId);
    const items = await GetCartItems(userId)
    console.log(items)
    res.render("cart.ejs",{
      items:items,
      cartItems:cartItems,
    })
  }else{
    res.redirect("/login")
  }
})

app.post("/cart", async(req, res)=>{
  if(req.isAuthenticated()){
    const cartId = req.body.cartId;
    await DeleteFromCart(cartId)
    res.redirect("/cart")
  }else{
    res.redirect("/login")
  }
})

app.post("/placeOrder", async(req, res)=>{
  if(req.isAuthenticated()){
    const userId = req.user.id;
    const additional = req.body.additionalNotes
    const method = req.body.method
    await PlaceOrder(userId, additional, method)
    res.redirect("/cart")
  }else{
    res.redirect("/login")
  }
})

// authenticate
app.get("/login", async(req, res)=>{
    res.render("login.ejs")
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/auth/google", passport.authenticate("google",{
    scope:["profile","email"],
}))
app.get("/auth/google/secrets", passport.authenticate("google", {
    scope:["profile","email"],
    successRedirect: "/home",
    failureRedirect: "/login",
}));

app.post(
    "/login",
    passport.authenticate("local", {
      successRedirect: "/home",
      failureRedirect: "/login",
    })
);
app.post("/register", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
  
    try {
      const checkResult = await db.query("SELECT * FROM users WHERE useremail = $1", [
        email,
      ]);
  
      if (checkResult.rows.length > 0) {
        res.redirect("/login");
      } else {
        bcrypt.hash(password, saltRounds, async (err, hash) => {
          if (err) {
            console.error("Error hashing password:", err);
          } else {
            const result = await db.query(
              "INSERT INTO users (useremail, password) VALUES ($1, $2) RETURNING *",
              [email, hash]
            );
            const user = result.rows[0];
            req.login(user, (err) => {
              console.log("success");
              res.redirect("/home");
            });
          }
        });
      }
    } catch (err) {
      console.log(err);
    }
});
  
passport.use("local",
    new Strategy(async function verify(username, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE useremail = $1 ", [
          username,
        ]);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              //Error with password check
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              if (valid) {
                //Passed password check
                console.log("user logged in")
                return cb(null, user);
              } else {
                //Did not pass password check
                console.log("user not logged in")
                return cb(null, false);
              }
            }
          });
        } else {
          console.log("user not found")
          return cb("User not found");
        }
      } catch (err) {
        console.log(err);
      }
    })
);
  
passport.use("google", new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL:"http://localhost:3000/auth/google/secrets",
            userProfileURL:"http://www.googleapis.com/oauth2/v3/userinfo"
        }, async (accessToken, refreshToken, profile, cb)=>{
        console.log(profile);
        try{
        const result =await db.query("SELECT * FROM users WHERE useremail = $1", [profile.email])
        if(result.rows.length === 0){
            //set password as google in database to show that this is a user logged in with google.
            //do not get password from google.
            const newUser = await db.query("INSERT INTO users (useremail, password) VALUES ($1, $2)", [profile.email, "google"])
            cb(null, newUser.rows[0]);
        }else{
            //Already existing user
            cb(null, result.rows[0]);
        }
        }catch(err){
        cb(err);
        }
    })
);
  
passport.serializeUser((user, cb) => {
    cb(null, user);
});
passport.deserializeUser((user, cb) => {
    cb(null, user);
});

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

// function to get all items of specified category
async function getItemsOfCategory(category) {
    let items=[]
    const result = await db.query("SELECT * FROM item WHERE category = $1", [category])
    result.rows.forEach((item)=>{
        items.push(item)
    })
    return items
}

async function GetItem(itemId) {
  let items=[]
  const result = await db.query("SELECT * FROM item WHERE id = $1", [itemId])
  result.rows.forEach((item)=>{
    items.push(item)
  })
  return items[0]
}

async function AddToOrder(userId, itemId, milkType) {
  if(milkType == "X"){
    const additional = "No Additional Notes"
    await db.query("INSERT INTO cart (itemid, userid, additionalinfo) VALUES ($1, $2, $3)",[itemId, userId, additional])
    console.log("Item added to order.")
  }else{
    const additional = "Milk Type: "+ milkType;
    console.log(milkType)
    await db.query("INSERT INTO cart (itemid, userid, additionalinfo) VALUES ($1, $2, $3)",[itemId, userId, additional])
    console.log("Item added to order.")
  }
}

async function GetCartCount(userId) {
  let totalItems=0
  const result= await db.query("SELECT * FROM cart WHERE userid = $1",[userId])
  result.rows.forEach(row=>{
    totalItems= totalItems+1;
  })
  return totalItems
}
async function GetCartItems(userId) {
  let items=[]
  const result= await db.query("SELECT * FROM item JOIN cart ON item.id = cart.itemid WHERE userid = $1",[userId])
  result.rows.forEach(item=>{
    items.push(item)
  })
  return items
}

async function NeedsMilk(itemId) {
  const result = await db.query("SELECT * FROM item WHERE id = $1", [itemId])
  return result.rows[0].milk
}

async function DeleteFromCart(id) {
  console.log("item to delete: "+id)
  const result= await db.query("DELETE FROM cart WHERE id = $1",[id])
  console.log("Item deleted")
}

async function LeaveReview(content, rating) {
  await db.query("INSERT INTO review (content, rating) VALUES ($1, $2)",[content, rating])
  console.log("Review posted.")
}

async function PlaceOrder(userId, additional, method) {
  let items=[]
  let totalBeforeTax=0
  const resultUser =await db.query("SELECT * FROM users WHERE id = $1", [userId])
  const user=resultUser.rows[0].useremail
  const result= await db.query("SELECT * FROM item JOIN cart ON item.id = cart.itemid WHERE userid = $1",[userId])
  result.rows.forEach(item=>{
    let itemInfo= "Item: "+item.name.replaceAll("_", " ")+", additional notes: "+ item.additionalinfo;
    items.push(itemInfo);
    totalBeforeTax += item.price;
  })
  const totalTax=totalBeforeTax*taxPercentage/100;
  const totalAfterTax=totalBeforeTax+totalTax;
  const deliveryMethod=method
  const additionalNotes =additional

  console.log("User: "+ user+ " ordered: \n"+ items+ "\nAdditional notes: "+ additionalNotes+ "\nDelivery method: "+deliveryMethod+ "\nWith a total before tax of R"+totalBeforeTax+ "\nAnd a total tax of "+ totalTax+ "\nAnd a total after tax of "+totalAfterTax)
  await db.query("INSERT INTO orders (userId, itemsordered, totalbeforetax, totaltax, totalaftertax, deliverymethod, additionalnotes) VALUES ($1, $2, $3, $4, $5, $6, $7)",[userId, items, totalBeforeTax, totalTax, totalAfterTax, deliveryMethod, additionalNotes])
  await db.query("DELETE FROM cart WHERE userid = $1",[userId])
}