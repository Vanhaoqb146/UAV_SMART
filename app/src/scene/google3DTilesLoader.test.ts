import { describe, expect, it } from "vitest";
import {
  GOOGLE_3D_PRESETS,
  latLonToSlippyTile,
  parseGoogleMapsCoordinates,
} from "./google3DTilesLoader";
import {
  getAllowedMapsForExercise,
  getTierForExercise,
} from "./mapCurriculumConfig";

describe("Google Maps 3D Coordinate & Tile Utilities", () => {
  it("enforces progressive map complexity tiers across BT01-BT13", () => {
    // Tier 1 basic exercises only allow the simple airbase training field
    for (const exId of ["BT01", "BT02", "BT03", "BT04", "BT05", "BT06"]) {
      const tier = getTierForExercise(exId);
      expect(tier.tierNumber).toBe(1);
      expect(getAllowedMapsForExercise(exId).map((m) => m.id)).toEqual(["airbase"]);
    }

    // Tier 2 forest & obstacle exercises unlock forest terrain
    expect(getTierForExercise("BT07").tierNumber).toBe(2);
    expect(getTierForExercise("BT09").defaultMap).toBe("forest");

    // Tier 3 urban exercises unlock urban, landmark81, and google3d
    expect(getTierForExercise("BT12").tierNumber).toBe(3);
    expect(getAllowedMapsForExercise("BT12").map((m) => m.id)).toContain(
      "landmark81"
    );

    // Tier 4 final assessment unlocks tactical & google3d
    expect(getTierForExercise("BT08").tierNumber).toBe(4);
    expect(getTierForExercise("BT08").defaultMap).toBe("tactical");
  });

  it("parses standard Google Maps @lat,lon URLs", () => {
    const res = parseGoogleMapsCoordinates(
      "https://www.google.com/maps/@10.795123,106.721945,17z?entry=ttu"
    );
    expect(res).toEqual({ lat: 10.795123, lon: 106.721945 });
  });

  it("parses Google Maps !3d!4d place URLs", () => {
    const res = parseGoogleMapsCoordinates(
      "https://www.google.com/maps/place/Landmark+81/data=!3d10.7951!4d106.7219"
    );
    expect(res).toEqual({ lat: 10.7951, lon: 106.7219 });
  });

  it("parses raw comma or space separated lat, lon pairs including negative longitudes", () => {
    expect(parseGoogleMapsCoordinates("16.0611, 108.2272")).toEqual({
      lat: 16.0611,
      lon: 108.2272,
    });
    expect(parseGoogleMapsCoordinates("40.7061 -74.0088")).toEqual({
      lat: 40.7061,
      lon: -74.0088,
    });
  });

  it("rejects invalid or out-of-range coordinates", () => {
    expect(parseGoogleMapsCoordinates("")).toBeNull();
    expect(parseGoogleMapsCoordinates("not-a-coordinate")).toBeNull();
    expect(parseGoogleMapsCoordinates("95.0, 200.0")).toBeNull();
  });

  it("computes valid Web Mercator Slippy Map tile indices at zoom 17", () => {
    const lm81 = GOOGLE_3D_PRESETS[0];
    const tile = latLonToSlippyTile(lm81.lat, lm81.lon, 17);
    expect(tile.x).toBeGreaterThan(100000);
    expect(tile.y).toBeGreaterThan(60000);
  });
});
