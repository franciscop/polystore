import axios from "axios";
import { setupCache } from "axios-cache-interceptor";
import axiosCacheStorage from "polystore/axios-cache-interceptor";

const http = setupCache(axios, {
  storage: axiosCacheStorage(new Map()),  // swap new Map() for Redis, SQLite, etc.
});

// First request hits the network
const { data: first } = await http.get("https://jsonplaceholder.typicode.com/todos/1");
console.log("First request (network):", first);

// Second request is served from cache
const { data: second } = await http.get("https://jsonplaceholder.typicode.com/todos/1");
console.log("Second request (cached):", second);
