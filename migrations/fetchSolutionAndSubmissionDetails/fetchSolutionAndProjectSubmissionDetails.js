/**
 * name : projectStatsBySolution.js
 * description : Script to fetch project statistics grouped by solution
 */

const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoUrl = process.env.MONGODB_URL;
const dbName = mongoUrl.split("/").pop();
const url = mongoUrl.split(dbName)[0];

let db, connection;
(async () => {
  try {
    connection = await MongoClient.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    db = connection.db(dbName);
    console.log("✅ Connected to MongoDB:", dbName);

    // fetch solutions with required fields
    const solutions = await db
      .collection("solutions")
      .find({}, { projection: { name: 1, programId: 1, programName: 1 } })
      .toArray();

    console.log(`🔎 Found ${solutions.length} solutions`);

    const results = [];

    // helper to split into chunks
    function chunkArray(arr, size) {
      return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
      );
    }

    const chunks = chunkArray(solutions, 50);

    for (const chunk of chunks) {
      for (const solution of chunk) {
        const solutionId = solution._id;

        // total projects count
        const totalProjects = await db.collection("projects").countDocuments({
          solutionId: solutionId,
        });

        // first project
        let firstProject = await db
          .collection("projects")
          .find({ solutionId: solutionId })
          .sort({ createdAt: 1 })
          .limit(1)
          .project({ _id: 1, createdAt: 1 })
          .toArray();

        // last project
        let lastProject = await db
          .collection("projects")
          .find({ solutionId: solutionId })
          .sort({ createdAt: -1 })
          .limit(1)
          .project({ _id: 1, createdAt: 1 })
          .toArray();

        results.push({
          solutionId: solutionId,
          solutionName: solution.name || "",
          programId: solution.programId || "",
          programName: solution.programName || "",
          totalProjectsCreated: totalProjects,
          firstProject: firstProject[0] || null,
          lastProject: lastProject[0] || null,
        });

        console.log(
          `📊 Processed solution ${solutionId}: ${totalProjects} projects`
        );
      }
    }

    // save results into JSON
    fs.writeFileSync(
      path.join(__dirname, "projectStatsBySolution.json"),
      JSON.stringify(results, null, 2)
    );

    console.log("✅ Results saved to projectStatsBySolution.json");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
})();
