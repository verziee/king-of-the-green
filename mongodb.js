const mongoose = require("mongoose");
const path = require("path");

// require("dotenv").config({
//     path: path.resolve(__dirname, "credentialsDontPost/.env"),
// });

const uri = process.env.MONGO_CONNECTION_STRING;

mongoose.connect(uri)
.then(()=>{
    console.log("Connected to MongoDB");
})
.catch((err)=>{
    console.error("MongoDB connection error:", err);
});

const UserSchema = new mongoose.Schema({
    username: {type:String, required:true, unique:true},
    password: {type:String, required:true},
    firstname: {type:String, required:true},
    lastname: {type:String, required:true},
    
    //Stores round history using course ids
    round_history: {
        type: Object,
        default: {}
    }
});

const GroupSchema = new mongoose.Schema({
    //group name
    name: {type:String, required:true, unique:true},

    //list of member user IDs
    members: [{type:mongoose.Schema.Types.ObjectId, ref:"User"}],

    //list of member user IDs who have group admin controls (typically the group creator)
    admin: [{type:mongoose.Schema.Types.ObjectId, ref:"User"}],

    //group description
    description: {type:String},

    //Group password
    password: {type:String, required:true}
});

const User = new mongoose.model("User", UserSchema);

const Group = new mongoose.model("Group", GroupSchema);

module.exports = {User, Group};

