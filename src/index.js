import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from "fs";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

app.use(express.json());

// Use AFM file as prompt template
const afmFile = fs.readFileSync("./agents/openapi-drift.md", "utf-8");
// Split YAML frontmatter and markdown
const parts = afmFile.split("---");

// parts[1] = YAML config
// parts[2] = instructions (Role + Instructions)
const config = yaml.load(parts[1]);
const instructions = parts[2].trim();

console.log("Loaded AFM Agent:", config.name);

const openai = new OpenAI({
    apiKey: process.env[config.model.authentication.api_key.replace('${env:', '').replace('}', '')],
    baseURL: config.model.base_url,
});

// 🔹 Webhook endpoint
app.post("/webhook", async (req, res) => {
    try {
        const action = req.body.action;

        if (!["opened", "reopened", "synchronize"].includes(action)) {
            return res.send("Ignored event");
        }

        const pr = req.body.pull_request;
        const repo = req.body.repository;

        const owner = repo.owner.login;
        const repoName = repo.name;
        const prNumber = pr.number;

        console.log("Processing PR:", pr.html_url);

        // 🔹 1. Get PR diff
        const diffRes = await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                    Accept: "application/vnd.github.v3.diff",
                },
            }
        );

        const diff = await diffRes.text();

        // 🔹 2. Get OpenAPI file
        const fileRes = await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/contents/openapi.yaml`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                },
            }
        );

        if (fileRes.status !== 200) {
            console.log("No openapi.yaml found");
            return res.send("No OpenAPI file found");
        }

        const fileData = await fileRes.json();
        const openapi = Buffer.from(fileData.content, "base64").toString("utf-8");

        // 🔹 3. Send ONLY DATA (no instructions here)
        const aiRes = await openai.chat.completions.create({
            model: config.model.name,
            messages: [
                {
                    role: "system",
                    content: instructions, // from AFM
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        pr_url: pr.html_url,
                        diff: diff,
                        openapi: openapi,
                    }),
                },
            ],
        });

        const result = aiRes.choices[0].message.content;

        console.log("AI Result:\n", result);

        // 🔹 4. Comment on PR
        await fetch(
            `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    body: result,
                }),
            }
        );

        res.send("Drift check completed");
    } catch (err) {
        console.error(err);
        res.status(500).send("Error");
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});