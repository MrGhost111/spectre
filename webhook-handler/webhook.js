const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

// Configuration (you'll need to update these)
const PORT = 3000;
const SECRET = 'okaybro';
const REPO_PATH = '/home/ubuntu/spectre';  // Path on your Ubuntu server

const server = http.createServer((req, res) => {
  // Only respond to POST requests at the webhook endpoint
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    
    // Get the signature from GitHub
//    const signature = req.headers['x-hub-signature'];
    
    // If there's no signature, reject the request
  //  if (!signature) {
    //  res.statusCode = 401;
      //return res.end('Unauthorized');
    //}
    
    // Collect the request body
   // req.on('data', chunk => {
   //   body += chunk.toString();
   // });
    
    // When the request is finished
   // req.on('end', () => {
      // Verify signature from GitHub
  //    const hmac = crypto.createHmac('sha1', SECRET);
   //   const calculatedSignature = 'sha1=' + hmac.update(body).digest('hex');
      
      // If signatures don't match, reject the request
    //  if (signature !== calculatedSignature) {
     //   res.statusCode = 401;
     //   res.end('Invalid signature');
      //  return;
     // }
      
      // Parse the body to get repository information
      try {
        const payload = JSON.parse(body);
        console.log(`Received push from ${payload.repository.full_name}`);
        
        // Execute git pull in your repository directory
        exec(`cd ${REPO_PATH} && git pull`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error: ${error.message}`);
            res.statusCode = 500;
            res.end('Server error during git pull');
            return;
          }
          
          if (stderr) {
            console.error(`Git stderr: ${stderr}`);
          }
          
          console.log(`Git stdout: ${stdout}`);
          console.log('Deployment completed successfully!');
          
          // Respond to GitHub
          res.statusCode = 200;
          res.end('OK');
        });
      } catch (error) {
        console.error(`Error parsing webhook payload: ${error.message}`);
        res.statusCode = 400;
        res.end('Bad request');
      }
    });
  } else {
    // Handle other requests
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server running on port ${PORT}`);
});

