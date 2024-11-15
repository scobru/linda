# React using GUN for P2P Chatting

## How to use
This app is using React, Express and Gun as library to run

### Preparing
in `gun-p2p-message/` run
```
yarn install
```
then, 
```
cd ./client/
yarn install
```

### Run the apps
assume you're in the rootdir
```
yarn test
```
in new terminal:
```
cd ./client/
yarn start
```
new tab will open in browser with `http://localhost:3000`

Enjoyy..

## This is now a working Chat App with Node Radata storage (Radix Tree)

### Feature: 
- Encrypted Chat App (End-to-End Encryption using DH Key Exchange Method)
- Add Friend (by PubKey & Stranger)
- Toast Notification
- Incoming Message from Stranger
- File Upload (Image)

### Work-in-Progress:
- [x] E-E2E Chat Messages
- [x] Friend & Stranger
- [x] E2E asymmetric encryption (DH Key Exchange)
- [x] File upload
- [ ] Online indicator
- [ ] ~~MongoDB for persisting data~~
