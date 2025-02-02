'use strict';

import express from 'express';
import * as api from './api.js';
import * as admin from './admin.js';
import * as user from './user.js';
import * as message from './message.js';
import * as inbox from './inbox.js';
import * as webfinger from './webfinger.js';

// Crea router per ogni modulo
const apiRouter = express.Router();
const adminRouter = express.Router();
const userRouter = express.Router();
const messageRouter = express.Router();
const inboxRouter = express.Router();
const webfingerRouter = express.Router();

// Configura le route per ogni modulo
api.configure(apiRouter);
admin.configure(adminRouter);
user.configure(userRouter);
message.configure(messageRouter);
inbox.configure(inboxRouter);
webfinger.configure(webfingerRouter);

// Configura il middleware per il parsing del body
apiRouter.use(express.urlencoded({ extended: true }));
adminRouter.use(express.urlencoded({ extended: true }));

export default {
  api: apiRouter,
  admin: adminRouter,
  user: userRouter,
  message: messageRouter,
  inbox: inboxRouter,
  webfinger: webfingerRouter,
};
