import { message } from "./message.js";
document.querySelector("#module").textContent = message;
const response = await fetch("../api/message");
const value = (await response.json()).message;
document.querySelector("#api").textContent = value;
const clientOnly = document.createElement("p");
clientOnly.id = "client-only";
clientOnly.textContent = value;
document.body.append(clientOnly);
