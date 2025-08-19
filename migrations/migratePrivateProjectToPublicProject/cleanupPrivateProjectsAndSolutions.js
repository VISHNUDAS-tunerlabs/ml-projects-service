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

    console.log("✅ Connected to DB:", dbName);

    // Step 1: Get unique solutionIds from migrated projects
    const projects = await db
      .collection("projects")
      .find(
        { migratedFromPrivateProject: true },
        { projection: { solutionId: 1 } }
      )
      .toArray();

    const uniqueSolutionIds = [
      ...new Set(
        projects
          .map((p) => (p.solutionId ? p.solutionId.toString() : null))
          .filter(Boolean)
      ),
    ].map((id) => ObjectId(id));

    if (uniqueSolutionIds.length === 0) {
      console.log(
        "⚠️ No projects found with migratedFromPrivateProject = true"
      );
      process.exit(0);
    }

    console.log(
      `📌 Found ${uniqueSolutionIds.length} unique parent solutionIds`
    );

    // Step 2: Find private solutions with parentSolutionId in these
    const privateSolutions = await db
      .collection("solutions")
      .find(
        {
          parentSolutionId: { $in: uniqueSolutionIds },
          isAPrivateProgram: true,
        },
        { projection: { _id: 1, programId: 1 } }
      )
      .toArray();

    if (privateSolutions.length === 0) {
      console.log("⚠️ No private solutions found for cleanup");
      process.exit(0);
    }

    console.log(
      `🧹 Found ${privateSolutions.length} private solutions for cleanup`
    );

    const privateSolutionIds = privateSolutions.map((s) => s._id);
    const privateProgramIds = privateSolutions
      .map((s) => s.programId)
      .filter(Boolean);
    console.log("privateSolutionIds : ", privateSolutionIds);
    console.log("privateProgramIds : ", privateProgramIds);

    // Step 3: Delete programs by programId
    const programResult = await db.collection("programs").deleteMany({
      _id: { $in: privateProgramIds },
      isAPrivateProgram: true,
    });
    console.log(`🗑️ Deleted ${programResult.deletedCount} programs`);

    // Step 4: Delete solutions by _id
    const solutionResult = await db.collection("solutions").deleteMany({
      _id: { $in: privateSolutionIds },
      isAPrivateProgram: true,
    });
    console.log(`🗑️ Deleted ${solutionResult.deletedCount} solutions`);

    // Step 5: Write cleanup output file
    const output = {
      removedPrivateSolutionIds: privateSolutionIds.map((id) => id.toString()),
      removedPrivateProgramsIds: privateProgramIds.map((id) => id.toString()),
      count: {
        privateSolutions: solutionResult.deletedCount,
        privatePrograms: programResult.deletedCount,
      },
    };

    const outFile = path.join(__dirname, "cleanupOutput.json");
    fs.writeFileSync(outFile, JSON.stringify(output, null, 2));
    console.log(`📄 Cleanup output written to ${outFile}`);

    console.log("✅ Cleanup complete");
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    if (connection) await connection.close();
  }
})();
