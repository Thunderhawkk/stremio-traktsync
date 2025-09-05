// create-admin.js
// Simple script to create or promote a user to admin role

require('dotenv').config();
const { repo } = require('./src/db/repo');
const { createUser } = require('./src/services/auth');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function promptInput(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

async function main() {
  try {
    await require('./src/db/repo').initDb();
    
    console.log('=== Admin User Management ===\n');
    
    const action = await promptInput('Choose action:\n1. Create new admin user\n2. Promote existing user to admin\n3. List all users\nEnter choice (1-3): ');
    
    if (action === '1') {
      // Create new admin user
      const username = await promptInput('Enter admin username: ');
      const email = await promptInput('Enter admin email (optional): ');
      const password = await promptInput('Enter admin password: ');
      
      if (!username || !password) {
        console.log('Username and password are required!');
        process.exit(1);
      }
      
      try {
        const admin = await createUser({
          username,
          email: email || null,
          password,
          role: 'admin'
        });
        
        console.log(`\n✅ Admin user created successfully!`);
        console.log(`ID: ${admin.id}`);
        console.log(`Username: ${admin.username}`);
        console.log(`Email: ${admin.email || 'N/A'}`);
        console.log(`Role: ${admin.role}`);
        
      } catch (error) {
        console.error('❌ Failed to create admin user:', error.message);
        if (error.message.includes('username_taken')) {
          console.log('Try promoting the existing user instead (option 2).');
        }
      }
      
    } else if (action === '2') {
      // Promote existing user
      const username = await promptInput('Enter username to promote: ');
      
      try {
        const user = await repo.findUserByUsername(username);
        if (!user) {
          console.log('❌ User not found!');
          process.exit(1);
        }
        
        if (user.role === 'admin') {
          console.log('✅ User is already an admin!');
          process.exit(0);
        }
        
        const updatedUser = await repo.updateUser(user.id, { role: 'admin' });
        
        console.log(`\n✅ User promoted to admin successfully!`);
        console.log(`ID: ${updatedUser.id}`);
        console.log(`Username: ${updatedUser.username}`);
        console.log(`Email: ${updatedUser.email || 'N/A'}`);
        console.log(`Role: ${updatedUser.role}`);
        
      } catch (error) {
        console.error('❌ Failed to promote user:', error.message);
      }
      
    } else if (action === '3') {
      // List all users
      try {
        const users = await repo.listUsers();
        
        console.log(`\n=== All Users (${users.length}) ===`);
        users.forEach((user, index) => {
          console.log(`${index + 1}. ${user.username} (${user.role}) - ${user.email || 'No email'}`);
        });
        
        if (users.length === 0) {
          console.log('No users found.');
        }
        
      } catch (error) {
        console.error('❌ Failed to list users:', error.message);
      }
      
    } else {
      console.log('Invalid choice!');
    }
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  } finally {
    rl.close();
    process.exit(0);
  }
}

main();