/**
 * name : restoreSolutionsAndPrograms.js
 * description : Restore missing solutions & programs from backup DB into prod DB
 */

const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const _ = require("lodash");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoUrl = process.env.MONGODB_URL; // prod

const prodDbName = mongoUrl.split("/").pop();
const backupDbName = "sl-prod-backup";

const urlProd = mongoUrl.split(prodDbName)[0];

// add your solutionIds here
const allSolutionIds = [
  // "64f6f5f3c2d91a1a12345678", ...
];

const CHUNK_SIZE = 500;

let prodConnection, backupConnection;
(async () => {
  try {
    prodConnection = await MongoClient.connect(urlProd, {
      useUnifiedTopology: true,
    });
    const prodDb = prodConnection.db(prodDbName);
    console.log("✅ Connected to PROD DB");

    backupConnection = await MongoClient.connect(urlProd, {
      useUnifiedTopology: true,
    });
    const backupDb = backupConnection.db(backupDbName);
    console.log("✅ Connected to BACKUP DB");

    let solutionIdsToRestore = new Set();
    let programIdsToRestore = new Set();

    // --- Stage 1: Find which solutionIds actually have projects ---
    const solChunks = _.chunk(allSolutionIds, CHUNK_SIZE);

    for (const chunk of solChunks) {
      const objectIds = chunk.map((id) => ObjectId(id));
      const projects = await backupDb
        .collection("projects")
        .find(
          { solutionId: { $in: objectIds } },
          { projection: { solutionId: 1 } }
        )
        .toArray();

      projects.forEach((p) =>
        solutionIdsToRestore.add(p.solutionId.toString())
      );
    }

    console.log(
      `📌 Found ${solutionIdsToRestore.size} solutionIds with projects`
    );

    if (solutionIdsToRestore.size === 0) {
      console.log("⚠️ No solutions found with active projects. Exiting.");
      return;
    }

    // --- Stage 2: Collect programIds from backup ---
    const solutionDocs = await backupDb
      .collection("solutions")
      .find({
        _id: {
          $in: Array.from(solutionIdsToRestore).map((id) => ObjectId(id)),
        },
      })
      .project({ _id: 1, programId: 1 })
      .toArray();

    solutionDocs.forEach((s) => {
      if (s.programId) programIdsToRestore.add(s.programId.toString());
    });

    console.log(`📌 Programs to restore: ${programIdsToRestore.size}`);

    let restoredPrograms = [];
    let restoredSolutions = [];

    // --- Stage 3: Restore Programs ---
    // if (programIdsToRestore.size > 0) {
    //   const programDocs = await backupDb
    //     .collection("programs")
    //     .find({
    //       _id: {
    //         $in: Array.from(programIdsToRestore).map((id) => ObjectId(id)),
    //       },
    //     })
    //     .toArray();

    //   const progChunks = _.chunk(programDocs, CHUNK_SIZE);
    //   for (const batch of progChunks) {
    //     if (batch.length) {
    //       await prodDb
    //         .collection("programs")
    //         .insertMany(batch, { ordered: false })
    //         .catch(() => {});
    //       restoredPrograms.push(...batch.map((p) => p._id.toString()));
    //       console.log(`✅ Inserted ${batch.length} programs`);
    //     }
    //   }
    // }

    // --- Stage 4: Restore Solutions ---
    // if (solutionIdsToRestore.size > 0) {
    //   const solDocs = await backupDb
    //     .collection("solutions")
    //     .find({
    //       _id: {
    //         $in: Array.from(solutionIdsToRestore).map((id) => ObjectId(id)),
    //       },
    //     })
    //     .toArray();

    //   const solChunksToInsert = _.chunk(solDocs, CHUNK_SIZE);
    //   for (const batch of solChunksToInsert) {
    //     if (batch.length) {
    //       await prodDb
    //         .collection("solutions")
    //         .insertMany(batch, { ordered: false })
    //         .catch(() => {});
    //       restoredSolutions.push(...batch.map((s) => s._id.toString()));
    //       console.log(`✅ Inserted ${batch.length} solutions`);
    //     }
    //   }
    // }

    // --- Stage 5: Write delta fix output file ---
    const output = {
      solutionIds: Array.from(solutionIdsToRestore),
      programIds: Array.from(programIdsToRestore),
      count: {
        solutions: solutionIdsToRestore.size,
        programs: programIdsToRestore.size,
      },
    };

    const outFile = path.join(__dirname, "deltafixoutput.json");
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`📄 Delta fix output written to ${outFile}`);

    console.log("🎉 Restore complete!");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    if (prodConnection) await prodConnection.close();
    if (backupConnection) await backupConnection.close();
  }
})();
