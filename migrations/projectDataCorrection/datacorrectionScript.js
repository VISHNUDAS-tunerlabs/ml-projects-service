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
    // get programId from command line argument
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

        // fetch program details
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


       /* ---------- 3. COMPONENT → USER → PRIVATE PROJECT AGGREGATION ---------- */

const componentUserPrivateProjects = {};

for (const [componentId, componentData] of Object.entries(output.components)) {
  const userMap = {};

  componentData.privateSolutions.forEach(solution => {
    solution.projects.forEach(project => {
      if (!project.userId) return;

      if (!userMap[project.userId]) {
        userMap[project.userId] = {
          userId: project.userId,
          privateProjectIds: []
        };
      }

      userMap[project.userId].privateProjectIds.push(project._id);
    });
  });

  // Only add component if at least one user has projects
  if (Object.keys(userMap).length > 0) {
    componentUserPrivateProjects[componentId] = Object.values(userMap);
  }
}
        console.log("componentUserPrivateProjects", componentUserPrivateProjects)

        const aggPath = path.join(
  output_dir,
  `component_user_private_projects_${timestamp}.json`
);

fs.writeFileSync(
  aggPath,
  JSON.stringify(componentUserPrivateProjects, null, 2),
  "utf8"
);

console.log("📄 Component-wise user private projects written to:", aggPath);


const finalResult = [];
const skippedComponents = [];   // track skipped components


for (const [componentId, users] of Object.entries(componentUserPrivateProjects)) {

    console.log("componentUserPrivateProjects", componentUserPrivateProjects    )

    const componentSolution = await db.collection("solutions").findOne(
    {
      _id: ObjectId(componentId),
      isAPrivateProgram: false
    },
    {
      projection: { scope: 1 }
    }
  );

  // 🔹 SKIP COMPONENT IF SOLUTION / SCOPE NOT PRESENT
  if (!componentSolution || !componentSolution.scope) {
    skippedComponents.push({
      componentId,
      reason: !componentSolution
        ? "Public component solution not found"
        : "Scope missing in public component solution"
    });
    continue; // ⛔ skip this component completely
  }

  for (const userEntry of users) {
    console.log("Processing user:", userEntry.userId, "for component:", componentId);
    const { userId, privateProjectIds } = userEntry;

    // 1️⃣ Check public project
    const publicProject = await db.collection("projects").findOne({
      solutionId: ObjectId(componentId),
      userId,
      isAPrivateProgram: false
    });
    console.log("Public project for user:", userId, "is", publicProject ? "found" : "not found");
    if (publicProject) continue; // ignore user entirely

    // 2️⃣ Fetch private projects
    const privateProjects = await db.collection("projects").find({
      _id: { $in: privateProjectIds.map(id => ObjectId(id)) },
      userId,
      isAPrivateProgram: true
    }).toArray();

    const ignoredMissingRoleInfo = [];
    const evaluatedProjects = [];
    // console.log("privateProjects",privateProjects)
    for (const project of privateProjects) {

      if (!project.userRoleInformation) {
        ignoredMissingRoleInfo.push(project._id.toString());
        continue;
      }
      console.log("componentSolution",componentSolution )
      // 3️⃣ Targeting check
      const targeted = isProjectTargeted(
        componentSolution,
        project.userRoleInformation
      );
      console.log("targeted",targeted )

      evaluatedProjects.push({
        projectId: project._id.toString(),
        targeted,
        updatedAt: project.updatedAt
      });
    }

    finalResult.push({
      componentId,
      userId,
      ignoredPrivateProjectMissingUserRoleInformation: ignoredMissingRoleInfo,
      evaluatedPrivateProjects: evaluatedProjects
    });
  }
}
console.log("finalResult", JSON.stringify(finalResult, null, 2));
function isProjectTargeted(solution, userRoleInformation) {

  /* ---------------- HARD FALSE CHECKS ---------------- */

  if (!solution || !solution.scope) return false;
  if (!userRoleInformation || typeof userRoleInformation !== "object") return false;

  const { scope } = solution;
  console.log("scop------------e", scope);

  if (
    !scope.entityType ||
    !Array.isArray(scope.entities) ||
    !Array.isArray(scope.roles)
  ) {
    return false;
  }

  /* ---------------- 1️⃣ ROLE CHECK ---------------- */

  // user role can be comma-separated
  const userRoles = userRoleInformation.role
    ? userRoleInformation.role.split(",").map(r => r.trim())
    : [];

  // always include ALL_ROLES
  userRoles.push("ALL");
//   console.log("userRoles------------->", userRoles);
//   const solutionRoles = scope.roles.map(r => r.code);
//   console.log("solutionRoles------------->", solutionRoles);
//   const roleMatched = userRoles.some(role =>
//     solutionRoles.includes(role)
//   );

// normalize user roles
const userRolesNormalized = userRoles.map(r => r.toLowerCase());

// normalize solution roles
const solutionRolesNormalized = scope.roles.map(r =>
  r.code.toLowerCase()
);

const roleMatched = userRolesNormalized.some(role =>
  solutionRolesNormalized.includes(role)
);
console.log("roleMatched------------->", roleMatched);
  if (!roleMatched) return false;

  /* ---------------- 2️⃣ ENTITY CHECK ---------------- */

  // remove role & type → collect registryIds + entityTypes
  const registryIds = [];
  const entityTypes = [];

  Object.entries(userRoleInformation)
  .filter(([key]) => key !== "role" && key !== "type")
  .forEach(([key, value]) => {
    if (!value) return;
    registryIds.push(value);
    entityTypes.push(key);
  });


  if (!registryIds.length || !entityTypes.length) return false;

  // entityType match AND entityId match (ANY ONE is enough)
  const entityMatched =
    entityTypes.includes(scope.entityType) &&
    registryIds.some(id => scope.entities.includes(id));

  return entityMatched;
}






        

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
