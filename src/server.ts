import "dotenv/config";
import { validateEnvironment } from "./config/environment.js";

const { PORT } = validateEnvironment("api");
const { default: app } = await import("./app.js");

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
