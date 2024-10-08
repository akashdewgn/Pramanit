const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const Org = require("../models/org");
const Event = require("../models/event");
const DiamSdk = require("diamnet-sdk");
const axios = require('axios');
const Certificate = require("../models/certificate")
const Participant = require("../models/participant")
const EmailVerification = require('../models/emailVerification');
const verifyToken = require('../middleware/verifyToken');
const checkRole = require('../middleware/checkRole')
const compression = require('compression');
const lzjs = require('lzjs');
const {compress, decompress} = require('../utils.js/compress');
// const encrypt = require("../utils.js/encrypt");
// const checkRole = require('../middleware/checkRole');

const server = new DiamSdk.Aurora.Server("https://diamtestnet.diamcircle.io/");



//config integration
dotenv.config();


// Multer storage configuration
const storage = multer.memoryStorage(); // Store files in memory
const upload = multer({ storage: storage });

cloudinary.config({ 
  cloud_name: 'dl7rna1p6', 
  api_key: '922831872121692', 
  api_secret: '9cHuX1EL1aPTlSR7R9W8kTskB5M'
});



// router.use(checkRole('organization'));




  router.get('/',verifyToken, checkRole(("organization")), async (req, res) => {
    const email = req.user.email; // Ensure req.oidc contains the email
    const name = req.user.name; // Ensure req.oidc contains the name

    console.log("Email:", email); // Check if email is available
    console.log("Name:", name); // Check if name is available

    try {
      // Check if the organization with this email already exists
      let org = await Org.findOne({ email });

      if (!org) {
        console.log("111")
        // If no organization is found, create a new one

        // create a completely new and unique pair of keys
        const pair = DiamSdk.Keypair.random();
        const privateKey = pair.secret();
        const publicKey = pair.publicKey();
        org = new Org({
          name: name,     // Ensure you are sending `name` in the request body
          publicKey: publicKey, // Ensure you are sending `publicKey` in the request body
          privateKey: privateKey, // Ensure you are sending `privateKey` in the request body
          email: email,                     // Authenticated user's email
        });

        // Save the new organization to the database
        await org.save();
        try {
          console.log("11")
          const response = await axios.get(
            `https://friendbot.diamcircle.io?addr=${encodeURIComponent(publicKey)}`
          );
          console.log("22")
          const responseJSON = response.data;
          console.log("33")
          console.log("SUCCESS! You have a new account :)\n", responseJSON);
         

        } catch (e) {
          console.error("ERROR!", e);
          res.status(500).json({ message: e.message });
        }
        
      }
      let orgDetails = await Org.findOne({email});
      let EventDetails = await Event.find({organisedBy: email});
      console.log("44")
      res.status(200).json({ message: 'Organization is verified.', org: orgDetails, events: EventDetails });
      
    } catch (error) {
      console.error('Error processing request:', error);
      res.status(500).json({ message: 'Server error', error });
    }
  });


//to be done later
router.post('/editInfo',verifyToken, checkRole(("organization")), async (req, res)=> {
  const file = req.file;

  if(file){
    cloudinary.uploader.upload_stream((error, result) => {
      if (error) {
        return res.status(500).send('Error uploading to Cloudinary: ' + error.message);
      }
          // Return the secure URL of the uploaded image
    res.status(200).send({ url: result.secure_url });
  }).end(file.buffer);
  }


  const uploadResult = await cloudinary.uploader
  .upload(
      'https://res.cloudinary.com/demo/image/upload/getting-started/shoes.jpg', {
          public_id: 'shoes',
      }
  )
  .catch((error) => {
      console.log(error);
  });

console.log(uploadResult);

})

// tested
router.post("/createEvent", verifyToken, checkRole(("organization")), async (req, res)=> {
  const eventName = req.body.eventName;
  const eventDescription = req.body.eventDescription;
  const dateTime = req.body.dateTime;

  try {
    const newEvent = new Event({
      organisedBy: req.user.email,
      eventName: eventName,
      description: eventDescription,
      dateTime: dateTime,
    })

  const savedEvent = await newEvent.save();

    res.status(200).json({message:"Event Created", success: true, savedEvent: savedEvent})
  } catch(e) {
    console.log("error in /creatEvent", e.message)
    res.status(500).json({msg: e.message, error:true })
  }
})


// tested
router.get("/event/:eventId", verifyToken, checkRole(("organization")), async (req, res) => {

  const { eventId } = req.params;
  const email = req.user.email;

  try {
    const event = await Event.findOne({ eventId, organisedBy: email });
    const certs = await Certificate.find({eventId});
    if (!event) {
      return res.status(404).json({ message: 'Event not found or you do not have access' });
    }

    res.status(200).json({
      message: 'Event details retrieved successfully',
      event,
    certificates: certs
    });
  } catch (e) {
    console.error('Error fetching event:', e);
    res.status(500).json({ message: 'Error fetching event', e });
  }

})


// testing
router.post("/event/:eventId/createCertificate",verifyToken, checkRole(("organization")),  async (req, res)=> {
  const email = req.user.email;
  const eventId = req.params.eventId;
  const issueToName = req.body.name;
  const issuedToEmail = req.body.email;
  const prize = req.body.prize;
  const dateTime = req.body.dateTime;
  let verificationId;
 

      // Validate input fields
      if (!issueToName || !issuedToEmail || !prize || !dateTime) {
        return res.status(400).json({ error: true, msg: "Missing required fields" });
    }

  try{

  //check and crerate key pairs for participant id;
  const recievingAcc = await Participant.findOne({email: issuedToEmail})
  
  let receivingKeyPair;

  if(!recievingAcc){
    console.log("11")
    const receivingKeys = DiamSdk.Keypair.random(); // Generate a new keypair

      const recievingSecret = receivingKeys.secret();
      const recievingPublicKey = receivingKeys.publicKey();
      const newParticipant = new Participant({
      name:issueToName,
      email: issuedToEmail,
      publicKey: recievingPublicKey,
      privateKey: recievingSecret,
    })
    // account saved in db
    await newParticipant.save();

    // account funded
    const response = await axios.get(
      `https://friendbot.diamcircle.io?addr=${encodeURIComponent(receivingKeys.publicKey())}`
    );
    console.log("22")
    const responseJSON = response.data;
    console.log("33")
    console.log("SUCCESS! You have a new account :)\n", responseJSON);
    receivingKeyPair = DiamSdk.Keypair.fromSecret(recievingSecret);
  } else {
    receivingKeyPair = DiamSdk.Keypair.fromSecret(recievingAcc.privateKey);
  }


  // get issuers keys

  const issuerDetails = await Org.findOne({email});
  console.log(issuerDetails)

  const eventDetails = await Event.findOne({eventId});
  console.log(eventDetails)
  const assetData = `${issuerDetails.name} ${issueToName} ${prize} ${eventDetails.eventName}`;
  console.log(assetData);

  const c = compress("jklasfhl;shgjkhasjghjkdhjkfhhfkasdfioprwiofioajfaosdfjiwerjifjjsjsdjfiojawoijofjidsajfojowejcjds");
  console.log(c);
  const d = decompress(c);
  console.log(d);

  const issuingKeyPair = DiamSdk.Keypair.fromSecret(issuerDetails.privateKey);

  const assetName = `Cert${issueToName.slice(0, 2)}${eventId.slice(0, 2)}`;
  const certificateAsset = new DiamSdk.Asset(assetName, issuingKeyPair.publicKey());

  // const compressedData = lzjs.compress(original);


  //**
  console.log("Starting transaction process");


  // Load the receiving account
  await server
    .loadAccount(receivingKeyPair.publicKey())
    .then(function (receiver) {
      console.log("Loaded receiving account");
  
      // Build the transaction for the receiving account
      var transaction = new DiamSdk.TransactionBuilder(receiver, {
        fee: 100,
        networkPassphrase: DiamSdk.Networks.TESTNET,
      })
        .addOperation(
          DiamSdk.Operation.changeTrust({
            asset: certificateAsset,
            limit: "1000",
          })
        )
        .setTimeout(100) // setTimeout is required for transactions
        .build();
  
      // Sign the transaction with the receiving keypair
      transaction.sign(receivingKeyPair);  // Use the Keypair object, not secret
  
      // Submit the transaction
      return server.submitTransaction(transaction);
    })
    .then(function (response) {
      console.log("Change trust transaction successful:", response);
  
      // Load the issuing account
      return server.loadAccount(issuingKeyPair.publicKey());
    })
    .then(function (issuer) {
      console.log("Loaded issuing account");
  
      // Build the transaction for the issuing account
      var transaction = new DiamSdk.TransactionBuilder(issuer, {
        fee: 100,
        networkPassphrase: DiamSdk.Networks.TESTNET,
      })
        .addOperation(
          DiamSdk.Operation.payment({
            destination: receivingKeyPair.publicKey(),
            asset: certificateAsset,
            amount: "10",
          })
        )
        .addMemo(DiamSdk.Memo.text(`${assetData}`))
        .setTimeout(100) // setTimeout is required for transactions
        .build();
  
      // Sign the transaction with the issuing keypair
      transaction.sign(issuingKeyPair);  // Use the Keypair object, not secret
  
      // Submit the transaction
      return server.submitTransaction(transaction);
    })
    .then(function (result) {
      console.log("Payment successful. Transaction hash:", result.hash);
      verificationId = result.hash;
    })
    .catch(function (error) {
      console.error("Error!", error);
    });
  //**

  //create certificate
    const org = await Org.findOne({email})
    const event = await Event.findOne({eventId});
    console.log(event)
    const newCertificate = new Certificate({
      issuedBy: org.name,
      issuerEmail: email,
      issuedToEmail: issuedToEmail,
      eventId: eventId,
      participantName: issueToName,
      prize,
      dateTime,
      verificationId: verificationId,
      eventName: event.eventName
    });
    await newCertificate.save();


    //email logic 
       //send congratulations email (usePlunk)
   const to = `${issuedToEmail}`;
   const subject = `Congratulations for your new certificate!`;
   const bodyContent = `
   <div style="font-family: 'Arial', sans-serif; line-height: 1.6; background-color: #f0f4f8; margin: 0; padding: 0;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f4f8; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);">
                    <!-- Header with diagonal background -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #4a90e2 0%, #5cb6e4 100%); padding: 40px 40px 60px 40px; text-align: center;">
                            <img src="https://pramanit.co/pramanit.png" alt="Pramanit Banner" style="width: 70%; height: auto; display: block; margin: 0 auto 20px;">
                            <h1 style="color: #ffffff; font-size: 28px; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">Your Certificate</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 40px 40px 20px;">
                            <h1 style="color: #333; font-size: 22px; font-weight: bold; margin-bottom: 20px;">Heyy,</h1>
                            <p style="color: #555; font-size: 16px; margin-bottom: 10px;">(${issuedToEmail})</p>
                            <p style="color: #555; font-size: 16px; margin-bottom: 20px;">You have been awarded a certificate! Register and login to our platform to view your certificates.</p>
                            <p style="color: #888; font-size: 14px; margin-bottom: 30px;">Please do not share with anybody.</p>
                            <!-- Button -->
                            <a href="https://pramanit.co/certificates/register" style="display: inline-block; padding: 12px 20px; font-size: 16px; color: #fff; background-color: #5cb6e4; text-decoration: none; border-radius: 5px;">View your Certificate</a>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #333; color: #ffffff; padding: 30px 40px; text-align: center;">
                            <p style="margin: 0 0 10px; font-size: 14px;">© 2024 Pramanit. All rights reserved.</p>
                            <p style="margin: 0; font-size: 14px;">
                                <a href="https://pramanit.co/" style="color: #5cb6e4; text-decoration: none;">Visit our website</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
   </div>

   `;
   const subscribed = true;
   const name = 'Pramanit';
   const headers = {};
   
   // Properly stringify the requestBody object
   const requestBody = JSON.stringify({
       to: to,
       subject: subject,
       body: bodyContent,
       subscribed: subscribed,
       name: name,
       headers: headers,
       metadata:{
         accountType: "organization"
       }
   });
   
   const options = {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${process.env.USE_PLUNK_API_KEY}`
       },
       body: requestBody
   };
   
   
       const response = await fetch('https://api.useplunk.com/v1/send', options);
       const data = await response.json();
       console.log(data); 

    // Send the asset details in response
    res.status(200).json({ success: true, verificationId: verificationId });
  } catch (e) {
    console.error("Error processing request:", e);
    res.status(500).json({error:true, msg: e.message});
  }
})


router.post("/login", async (req, res)=> {
  const { email, password } = req.body;

  try{
    const organization = await Org.findOne({email});
    console.log(organization);
    if(!organization){
      return res.status(404).json({message: "User not found"})
    }
    if(!organization.password){
     return res.json({message:"please register first"})
    }
 
    if(organization.emailVerification === false){
     return res.status(400).json({message:"This email is not  verified yet"})
    }
    const isMatch = await bcrypt.compare(password, organization.password);
    if(!isMatch){
     return res.status(400).json({message:"INVALID INPUTS/INPUT"})
    }
 
    const token = jwt.sign({email: organization.email, name: organization.name, role:"organization"}, process.env.JWT_SECRET, {expiresIn: "1h"});
 
    res.status(200).json({token: token});
   } catch (e) {
     return res.status(500).json({error:true, message:"Server Error"});
   }
})

router.post("/register", async (req,res)=> {
  const { name, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const receivingKeys = DiamSdk.Keypair.random(); // Generate a new keypair
  
  const recievingSecret = receivingKeys.secret();
  const recievingPublicKey = receivingKeys.publicKey();
  try{
    const newOrg = new Org({
      name: name,
      email: email,
      publicKey: recievingPublicKey,
      privateKey: recievingSecret,
      password: hashedPassword,
     })
     await newOrg.save();

     const newEmailVerification = new EmailVerification({
      email: email,
      role: "organization"
     })

     const savedEnrtyToEmailVerification = await newEmailVerification.save();

     const verificationId = savedEnrtyToEmailVerification.otp;
     const response1 = await axios.get(
      `https://friendbot.diamcircle.io?addr=${encodeURIComponent(receivingKeys.publicKey())}`
    );
    console.log("22")
    const responseJSON = response1.data;
    console.log("33")
    console.log("SUCCESS! You have a new account :)\n", responseJSON);

        //send verification email (usePlunk)
   const to = `${email}`;
   const subject = `Your OTP for PRAMANIT`;
   const bodyContent = `
   <div style="font-family: 'Arial', sans-serif; line-height: 1.6; background-color: #f0f4f8; margin: 0; padding: 0;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f4f8; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" width="600" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);">
                    <!-- Header with diagonal background -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #4a90e2 0%, #5cb6e4 100%); padding: 40px 40px 60px 40px; text-align: center;">
                            <img src="https://pramanit.co/pramanit.png" alt="Pramanit Banner" style="width: 70%; height: auto; display: block; margin: 0 auto 20px;">
                            <h1 style="color: #ffffff; font-size: 28px; margin: 0; text-shadow: 1px 1px 2px rgba(0,0,0,0.1);">Your OTP Code</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 40px 20px; position: relative;">
                            <!-- OTP Box (overlapping header and content) -->
                            <div style="background-color: #ffffff; border-radius: 12px; padding: 25px; margin-top: -50px; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1); text-align: center; margin-bottom: 30px;">
                                <p style="color: #555; font-size: 18px; margin: 0 0 15px;">Your One-Time Password is:</p>
                                <div style="background-color: #f0f4f8; border-radius: 8px; padding: 15px; display: inline-block;">
                                    <span style="font-size: 32px; font-weight: bold; color: #4a90e2; letter-spacing: 5px;">${verificationId}</span>
                                </div>
                                <p style="color: #888; font-size: 14px; margin: 15px 0 0;">This code will expire in <strong style="color: #4a90e2;">10 minutes</strong>.</p>
                            </div>
                            <p style="color: #555; font-size: 16px; margin-bottom: 20px;">Hello <strong style="color: #333;">${email}</strong>,</p>
                            <p style="color: #555; font-size: 16px; margin-bottom: 20px;">You've requested to verify your identity on Pramanit. Please use the OTP code above to complete your verification process.</p>
                            <p style="color: #555; font-size: 16px; margin-bottom: 20px;">For security reasons, please do not share this code with anyone.</p>
                        </td>
                    </tr>
                    <!-- Security Notice -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <div style="background-color: #f9f9f9; border-left: 4px solid #4a90e2; padding: 15px; border-radius: 4px;">
                                <p style="color: #666; font-size: 14px; margin: 0;"><strong style="color: #333;">Security Notice:</strong> If you didn't request this OTP, please ignore this email and contact our support team immediately.</p>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #333; color: #ffffff; padding: 30px 40px; text-align: center;">
                            <p style="margin: 0 0 10px; font-size: 14px;">© 2024 Pramanit. All rights reserved.</p>
                            <p style="margin: 0; font-size: 14px;">
                                <a href="https://pramanit.co" style="color: #5cb6e4; text-decoration: none;">Visit our website</a>
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
   </div>
   `;
   const subscribed = true;
   const nameOfCompany = 'Pramanit';
   const headers = {};
   
   // Properly stringify the requestBody object
   const requestBody = JSON.stringify({
       to: to,
       subject: subject,
       body: bodyContent,
       subscribed: subscribed,
       name: nameOfCompany,
       headers: headers,
       metadata:{
         accountType: "organization"
       }
   });
   
   const options = {
       method: 'POST',
       headers: {
           'Content-Type': 'application/json',
           Authorization: `Bearer ${process.env.USE_PLUNK_API_KEY}`
       },
       body: requestBody
   };
   
   
       const response = await fetch('https://api.useplunk.com/v1/send', options);
       const data = await response.json();
       console.log(data); 


  //response
  res.status(200).json({message:"An Email verification link has been sent to your inbox"});
  } catch(err) {
    console.log(err.message);
    res.status(500).json({message:"Internal Server Error"})
  }

})

router.post("/verifyEmail", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const verificationOrg = await EmailVerification.findOne({ email: email, role:"organization" });

    if (!verificationOrg) {
      return res.status(400).json({ error: true, message: "No verification record found" });
    }

    if (verificationOrg.otp !== otp) {
      return res.status(400).json({ error: true, message: "Wrong OTP" });
    }

    if (verificationOrg.role !== "organization") {
      return res.status(400).json({ error: true, message: "Unauthorized" });
    }

    // Update the emailVerification field to true
    const updatedOrg = await Org.findOneAndUpdate(
      { email: email, role: "organization" },
      { emailVerification: true },
      { new: true } // This option returns the updated document
    );

    // Check if the document was updated
    if (!updatedOrg) {
      return res.status(404).json({ error: true, message: "Organization not found or not updated" });
    }

    res.status(200).json({ message: "Email verified! Now you can log in", success: true });
  } catch (err) {
    console.error(err); // Log the error for debugging
    res.status(500).json({ message: "Internal Server Error" });
  }
});




module.exports = router;

//** legacy auth logic **//
// router.get('/login', (req, res) => {
//   if (req.oidc.isAuthenticated()) {
//     // If the user is already authenticated, redirect them to the desired page
//     return res.redirect('/org');
//   }

//   res.oidc.login({ 
//     authorizationParams: { 
//       prompt: 'login', 
//       connection: 'organizations', 
//       state: '/org' 
//     } 
//   });
// });

// // Handle callback logic from Auth0
// router.get('/callback', (req, res) => {
//   if (req.oidc.isAuthenticated()) {
//     // If user is authenticated, redirect to the desired page
//     res.redirect(req.query.state || '/org');
//   } else {
//     res.status(401).json({ message: 'User not authenticated' });
//   }
// });

// router.get('/logout', (req, res) => {
//   res.oidc.logout({
//     returnTo: '/', // Redirect after logout
//     logoutParams: {
//       federated: true, // This logs the user out of Auth0 and any other identity providers
//     },
//   });
// });