/**
 * fetchPrivateProgramData.js
 *
 * Usage:
 *   node fetchPrivateProgramData.js <programId>
 *
 * Reads:
 *  - Program → components
 *  - Private solutions per component
 *  - Private projects per solution
 *
 * Writes:
 *  - output/private_program_data_<timestamp>.json
 */

const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config({ path: path.join(__dirname, "../../") + "/.env" });

/* -------------------- ENV VALIDATION -------------------- */

const mongo_url = process.env.MONGODB_URL;
if (!mongo_url) {
  console.error("❌ MONGODB_URL not set");
  process.exit(1);
}

const programIdArg = process.argv[2];
if (!programIdArg || !ObjectId.isValid(programIdArg)) {
  console.error("❌ Please provide a valid programId");
  process.exit(1);
}

const programId = new ObjectId(programIdArg);

const db_name = mongo_url.split("/").pop();
const url = mongo_url.split(db_name)[0];

/* -------------------- OUTPUT SETUP -------------------- */

const output_dir = path.join(__dirname, "output");
if (!fs.existsSync(output_dir)) {
  fs.mkdirSync(output_dir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

/* -------------------- MAIN EXECUTION -------------------- */

(async () => {
  let connection;
  try {
    connection = await MongoClient.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    const db = connection.db(db_name);

    /* ---------- 1. FETCH PROGRAM ---------- */

    const program = await db.collection("programs").findOne(
      { _id: programId },
      { projection: { components: 1, name: 1 } }
    );
    console.log("program ", program);
    if (!program) {
      console.error("❌ Program not found:", programId.toHexString());
      process.exit(1);
    }

    const components = program.components || [];
    console.log(`✅ Program found. Components count: ${components.length}`);

    const output = {
      programId: programId.toHexString(),
      programName: program.name || "",
      generatedAt: new Date().toISOString(),
      components: {}
    };
    let privateUserIdsSet =[]
    /* ---------- 2. PROCESS EACH COMPONENT ---------- */

    for (const componentId of components) {
      const componentKey = componentId.toHexString();

      console.log(`🔍 Processing component: ${componentKey}`);

      /* ---- Fetch private solutions ---- */
      const privateSolutions = await db
        .collection("solutions")
        .find(
          {
            isAPrivateProgram: true,
            parentSolutionId: componentId,
            type: "improvementProject"
          },
          {
            projection: {
              _id: 1,
              parentSolutionId: 1,
              programId: 1,
              isAPrivateProgram: 1
            }
          }
        )
        .toArray();

      const enrichedSolutions = [];
     
      
        console.log("privateSolutions ", privateSolutions);
      /* ---- Fetch projects for each solution ---- */
      for (const solution of privateSolutions) {
        const projects = await db
          .collection("projects")
          .find(
            {
              solutionId: solution._id,
              isAPrivateProgram: true
            },
            {
              projection: {
                _id: 1,
                title: 1,
                status: 1,
                userId: 1,
                "certificate.eligible": 1,
                programId: 1,
                solutionId: 1,
                isAPrivateProgram: 1
              }
            }
          )
          .toArray();

        enrichedSolutions.push({
          _id: solution._id.toHexString(),
          parentSolutionId: solution.parentSolutionId
            ? solution.parentSolutionId.toHexString()
            : null,
          programId: solution.programId
            ? solution.programId.toHexString()
            : null,
          isAPrivateProgram: solution.isAPrivateProgram,
          projects: projects.map((p) => ({
            _id: p._id.toHexString(),
            title: p.title,
            status: p.status,
            userId: p.userId,
            certificateEligible:
              p.certificate && p.certificate.eligible === true
          }))
        });

        projects.forEach(p => {
            if (p.userId) {
            privateUserIdsSet.push(p.userId);
            }
        });
      }

      output.components[componentKey] = {
        privateSolutions: enrichedSolutions
      };
    }
    console.log("users", privateUserIdsSet)

    const projects = await db
    .collection("projects")
    .find(
      {
        programId: programId,
        userId: { $in: privateUserIdsSet }
      },
      {
        projection: {
          _id: 1,
          title: 1,
          status: 1,
          userId: 1,
          solutionId: 1,
          isAPrivateProgram: 1,
          createdAt: 1,
          updatedAt: 1
        }
      }
    )
    .toArray();

  const publicoutput = {
    programId,
    totalUsers: privateUserIdsSet.length,
    totalProjects: projects.length,
    projects: projects.map(p => ({
      _id: p._id.toHexString(),
      title: p.title,
      status: p.status,
      userId: p.userId,
      solutionId: p.solutionId ? p.solutionId.toHexString() : null,
      isAPrivateProgram: p.isAPrivateProgram,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt
    }))
  };

  const filePath = path.join(
    output_dir,
    `user_projects_${programId}_${Date.now()}.json`
  );

  fs.writeFileSync(filePath, JSON.stringify(publicoutput, null, 2), "utf8");

    /* ---------- 3. WRITE OUTPUT ---------- */

    const output_path = path.join(
      output_dir,
      `private_program_data_${timestamp}.json`
    );

    fs.writeFileSync(output_path, JSON.stringify(output, null, 2), "utf8");

    console.log("✅ Data extraction completed");
    console.log("📄 Output file:", output_path);

    await connection.close();
    process.exit(0);
  } catch (err) {
    console.error("❌ Fatal error:", err);
    if (connection) await connection.close();
    process.exit(1);
  }
})();
