import "@/utils/environment";
import { serviceHttp } from "@/middlewares/http";

export default serviceHttp({
  maxBodySize: 2 * 1024 * 1024,
  compress: true,
  cors: false,
  insightProxy: false,
});
