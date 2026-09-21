import { EventEmitter } from "node:events";
export const menuEvents = new EventEmitter();
menuEvents.setMaxListeners(0);
