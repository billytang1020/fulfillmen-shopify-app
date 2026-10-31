import { describe, expect, it } from "vitest";
import { fetchOptionalWarehouses } from "../app/wms/warehouse-list.server";
import { WAREHOUSE_LIST_PATH } from "../app/wms/register-warehouses";

describe("warehouse list wrapper", () => {
  it("calls GET /openapi/alibaba/warehouse/list and returns Style=4 minus 589", async () => {
    const paths: string[] = [];
    const warehouses = await fetchOptionalWarehouses(async (path) => {
      paths.push(path);
      return {
        data: [
          { Base_StyleInfoID: 536, Style: 4, Name: "Huizhou" },
          { Base_StyleInfoID: 589, Style: 4, Name: "HuiZhou3FL" },
          { Base_StyleInfoID: 101, Style: 4, Name: "Shenzhen" },
          { Base_StyleInfoID: 200, Style: 8, Name: "Shop" },
        ],
      };
    });

    expect(paths).toEqual([WAREHOUSE_LIST_PATH]);
    expect(warehouses.map((w) => w.id)).toEqual(["536", "101"]);
  });
});
