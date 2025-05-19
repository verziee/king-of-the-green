const http = require('http');
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require("path");
const portNumber = 5000;
const httpSuccessStatus = 200;
const httpFailStatus = 500;
const User = require("./mongodb").User;
const Group = require("./mongodb").Group;
const fetch = require("node-fetch");

const app = express();

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(express.json());
app.use(express.static("public"));


const bodyParser = require("body-parser");
const { error } = require('console');
app.use(bodyParser.urlencoded({extended:true}));
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "public"));

app.get("/", (req, res) => {
    if(req.session.userId){
        return res.redirect("/home");
    }
    //Render HTML using index template
    res.render("index");
});

app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/create-account", (req, res) => {
    res.render("createAccount");
});

app.get("/home", (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    //Render home page if logged in
    res.render("home");
});

app.post("/login", async (req, res) => {
    
    try{
        //Checks if username exists
        const checkUser = await User.findOne({username:req.body.username.toLowerCase().trim()});

        if(checkUser && checkUser.password === req.body.password){
            //Starts user session when logged in
            req.session.userId = checkUser._id;
            req.session.username = checkUser.username;
            res.render("home");
        }else{
            res.send("Wrong password. <a href=\"login\">return</a>");
        }

    }catch{
        res.send("Wrong username or password. <a href=\"login\">return</a>");
    }
    
});

app.post("/create-account", async (req, res) => {
    const userExists = await User.findOne({username: req.body.username.toLowerCase().trim()});
    if(userExists){
        return res.send("Error: username already exists. <a href=\"create-account\">return</a>");
    }
    const data = {
        username:req.body.username.toLowerCase().trim(),
        password:req.body.password,
        firstname:req.body.firstname,
        lastname:req.body.lastname
    }

    await User.insertMany([data]);

    res.render("login");
});

app.get("/logout", (req, res) => {
    req.session.destroy(err =>{
        if(err){
            return res.send("Logout error");
        }
        res.redirect("/");
    });
});

app.get("/groups", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    try{
        const groups = await Group.find({members: req.session.userId}).populate("members");
        res.render("groups", {groups});
    } catch(err) {
        res.send("Error loading groups:" + error.message);
    }
});

app.get("/join-group", (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    res.render("join-group");
});

app.get("/create-group", (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    res.render("create-group");
});

app.post("/join-group", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }
    const desiredGroup = await Group.findOne({name: req.body["group-name"].toLowerCase().trim()});
    if(!desiredGroup){
        return res.send("Error: group doesn't exist. <a href=\"join-group\">return</a>");
    }

    if(req.body["group-pw"] != desiredGroup.password){
        return res.send("Incorrect group password. <a href=\"join-group\">return</a>");
    }
    
    if(desiredGroup.members.includes(req.session.userId)){
        return res.send("You are already a member of this group. <a href=\"join-group\">return</a>");
    }

    desiredGroup.members.push(req.session.userId);

    await desiredGroup.save();

   res.redirect("/groups");
});

app.post("/create-group", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    const groupExists = await Group.findOne({name: req.body["group-name"]});
    if(groupExists){
        return res.send("Error: group name already exists. <a href=\"create-group\">return</a>");
    }

    let groupMembers = req.body.usernames || [];
    
    console.log("group members:", groupMembers);


    //If only one group member, convert to array
    if(!Array.isArray(groupMembers)){
        groupMembers = [groupMembers];
    }
    
    //Finds the users associated with group member usernames
    const users = await User.find({username:{$in:groupMembers}});

    //Convert to user IDs, since IDs are used in Group schema
    const memberIds = users.map(user => user._id);

    //Add creator to group members
    memberIds.push(req.session.userId);

    const data = {
        name:req.body["group-name"].toLowerCase().trim(),
        password:req.body["group-pw"],
        members:memberIds,
        admin:[req.session.userId],
        description: req.body.description || ""
    }

    await Group.insertMany([data]);

    res.redirect("/groups");

});

app.get("/manage-group", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }
    
    const group = await Group.findOne({name: req.query.groupname}).populate("members");
    const currUserId = req.session.userId;
    res.render("manage-group", {group, currUserId});
});

app.post("/remove-member", async (req, res) => {
    if(!req.session.userId){
        return res.redirect("/login");
    }
    
    const {memberId, groupId} = req.body;

    try{
        //Remove member from group
        await Group.findByIdAndUpdate(groupId, {
            $pull: {members: memberId, admin: memberId}
        });
        res.status(httpSuccessStatus).send("Member removed successfully");
    }catch(err){
        console.error("Failed to remove member", err);
        res.status(httpFailStatus).send("Failed to remove member");
    }
});

app.post("/leave-group", async (req, res) =>{
    if(!req.session.userId){
        return res.redirect("/login");
    }

    try{
        const { groupId } = req.body;
        //Remove userId from group
        await Group.findByIdAndUpdate(groupId, {
            $pull: {members: req.session.userId, admin: req.session.userId}
        });
        res.status(httpSuccessStatus).send("Left group successfully");
    }catch(err){
        console.error("Failed to leave group", err);
        res.status(httpFailStatus).send("Failed to leave group");
    }
});

app.post("/add-member", async (req, res) =>{
    if(!req.session.userId){
        return res.redirect("/login");
    }

    try{
        const { groupId, newMemberUsername } = req.body;
        const newMember = await User.findOne({username: newMemberUsername})

        if(!newMember){
            return res.send("User not found");
        }

        //Add newMember to group
        await Group.findByIdAndUpdate(groupId, {
            $addToSet: {members: newMember._id}
        });
        res.status(httpSuccessStatus).send("New member added successfuly");
    }catch(err){
        console.error("Failed to add new member", err);
        res.status(httpFailStatus).send("Failed to add new member");
    }
});

app.get("/search-course", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }
    const courseName = req.query["course-name"];

    try{
        //API request for inputted golf course using golfcourseapi.com
        const response = await fetch(`https://api.golfcourseapi.com/v1/search?search_query=${encodeURIComponent(courseName)}`, {
            headers: {
                "Authorization": `Key ${process.env.API_KEY}`
            }
        });

        if(!response.ok){
            throw new Error("API Error: " + response.status);
        }

        const data = await response.json();
        console.log(data);
        res.render("results", {course_data: data, search_query: courseName});
    }catch(err){
        console.error('Error with GolfCourseAPI request:', err);
        res.status(httpFailStatus).send('Error retrieving golf course data');
    }
    
});

app.get("/courses", (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }
    res.render("courses");
});

app.get("/view-course", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }
    
    const courseId = req.query.courseId;

    try{
        //API request for inputted golf course using golfcourseapi.com
        const response = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
            headers: {
                "Authorization": `Key ${process.env.API_KEY}`
            }
        });

        if(!response.ok){
            throw new Error("API Error: " + response.status);
        }

        const data = await response.json();
        const user = await User.findById(req.session.userId);

        console.log("round_history raw:", user.round_history);
        console.log("Course id:", data.course.id);



        console.log("Converted round_history:", user.round_history);

        try{
            const groups = await Group.find({members: req.session.userId}).populate("members");
            res.render("view-course", {course: data.course, user: user, groups: groups});
        } catch(err) {
            res.send("Error loading groups:" + error.message);
        }

    }catch(err){
        console.error('Error with GolfCourseAPI request:', err);
        res.status(httpFailStatus).send('Error retrieving golf course data');
    }
});

app.get("/input-score", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    const courseId = req.query["course-id"];

    try{
        //API request for inputted golf course using golfcourseapi.com
        const response = await fetch(`https://api.golfcourseapi.com/v1/courses/${courseId}`, {
            headers: {
                "Authorization": `Key ${process.env.API_KEY}`
            }
        });

        if(!response.ok){
            throw new Error("API Error: " + response.status);
        }

        const data = await response.json();
        const user = await User.findById(req.session.userId);
        res.render("input-round", {course: data.course, user: user});
    }catch(err){
        console.error('Error with GolfCourseAPI request:', err);
        res.status(httpFailStatus).send('Error retrieving golf course data');
    }

});

app.post("/input-round", async (req, res) => {
    //If not logged in, redirect to login page
    if(!req.session.userId){
        return res.redirect("/login");
    }

    const user = await User.findById(req.session.userId);

    //If user does not have round history field (due to creation before its implementation), initialize it
    if (!user.round_history) {
        user.round_history = {};
    }


    const courseId = req.body.courseId;
    const score = Number(req.body["round-score"]);
    const date = new Date(req.body.date);
    const newRound = {score: score, date: date};

    if (!user.round_history[courseId]) {
        user.round_history[courseId] = [];
    }

    //Add new round to round history of this course
    user.round_history[courseId].push(newRound);

    user.markModified("round_history");

    //save changes to user profile
    await user.save();

    //redirect back to the view course page
    res.redirect(`/view-course?courseId=${courseId}`);
});



app.listen(portNumber);

console.log(`Web server started and running at http://localhost:${portNumber}`);
process.stdout.write("Stop to shutdown the server: ");
process.stdin.setEncoding("utf8");
process.stdin.on('readable', () => {
    const dataInput = process.stdin.read();
    if(dataInput !== null){
        const command = dataInput.trim();
        if(command.toLowerCase() === "stop"){
            process.stdout.write("Shutting down the server");
            process.exit(0);
        } else{
            process.stdout.write(`Invalid command: ${command}\n`);
            process.stdout.write("Stop to shutdown the server: ");
        }
        process.stdin.resume();
    }
});
