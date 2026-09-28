/* =========================================================
   AI COST MONITOR — V3 (draft for review)
   gpuIndiaAI.js — IndiaAI Compute Portal GPU price catalogue.

   Source: https://compute.indiaai.gov.in/pricelist
   Verified: 2026-09-14 (transcribed from portal table).
   Currency: INR per HOUR per INSTANCE (as listed).
   Tiers kept side-by-side — never overwritten:
     onDemand | reserved1M | reserved6M | reserved12M
   V3 default per user choice: onDemand.

   Rules (same as AI catalogue):
   - Values are as-listed. Missing portal specs are null,
     NEVER 0. Anomalies carry note/dataQuality — never
     silently "fixed".
    - status: "active" only. No archived IndiaAI rows yet.
   ========================================================= */

export const GPU_INDIAAI_SOURCE = {
    portal: "IndiaAI Compute Portal",
    url: "https://compute.indiaai.gov.in/pricelist",
    currency: "INR",
    unit: "PER_HOUR_PER_INSTANCE",
    verifiedAt: "2026-09-14",
    note: "On-demand + 1/6/12-month reserved hourly instance prices, transcribed as listed."
};

export const GPU_INDIAAI_OEMS = {
    nvidia: { id: "nvidia", name: "NVIDIA" },
    amd: { id: "amd", name: "AMD" },
    intel: { id: "intel", name: "Intel" },
    aws: { id: "aws", name: "AWS (Inferentia / Trainium)" },
    gcp: { id: "gcp", name: "GCP (Trillium TPU)" }
};

function px(onDemand, reserved1M, reserved6M, reserved12M) {
    return { onDemand, reserved1M, reserved6M, reserved12M };
}

function specs(f16, fp32, matrixCore) {
    const norm = (v) => (v === 0 || v === null || v === undefined ? null : Number(v));
    // Portal lists 0.0 where spec is unpublished (B300 SXM, RTX PRO) → null.
    return { f16: norm(f16), fp32: norm(fp32), matrixCore: norm(matrixCore) };
}

function inst(id, oem, gpuType, instanceType, cards, memoryGB, specObj, pricing, extra) {
    return {
        id,
        oem,
        gpuType,
        instanceType,
        cards,
        memoryGB,
        specs: specObj,
        pricing,
        currency: "INR",
        unit: "PER_HOUR_PER_INSTANCE",
        status: "active",
        source: GPU_INDIAAI_SOURCE.url,
        ...(extra || {})
    };
}

/* ================= INDIAAI INSTANCES (73) =================
   id = slug of portal Instance Type (lowercase, dots→hyphens).
   gpuType preserves portal "GPU Type" label verbatim. */

export const GPU_INDIAAI_INSTANCES = {

    /* ---- AMD MI325X (4) ---- */
    "mi325x-1x": inst("mi325x-1x", "amd", "MI325X", "MI325X.1X", 1, 256,
        specs(1300.0, 163.4, 1216), px(169.2, 123.3, 102.6, 85.5)),
    "mi325x-2x": inst("mi325x-2x", "amd", "MI325X", "MI325X.2x", 2, 512,
        specs(2600.0, 326.8, 2432), px(338.4, 246.6, 205.2, 171.0)),
    "mi325x-4x": inst("mi325x-4x", "amd", "MI325X", "MI325X.4x", 4, 1024,
        specs(5200.0, 653.6, 4864), px(676.8, 493.2, 410.4, 342.0)),
    "mi325x-8x": inst("mi325x-8x", "amd", "MI325X", "MI325X.8X", 8, 2048,
        specs(10400.0, 1307.2, 9728), px(1351.8, 990.0, 820.8, 684.0)),

    /* ---- AMD MI300X (4) ---- */
    "mi300x-1x": inst("mi300x-1x", "amd", "MI300X", "MI300X.1X", 1, 192,
        specs(1300.0, 163.4, 1216), px(168.2, 165.04, 161.88, 148.0)),
    "mi300x-2x": inst("mi300x-2x", "amd", "MI300X", "MI300X.2X", 2, 384,
        specs(2600.0, 326.8, 2432), px(378.5, 371.35, 364.23, 333.0)),
    "mi300x-4x": inst("mi300x-4x", "amd", "MI300X", "MI300X.4X", 4, 768,
        specs(5200.0, 653.6, 4864), px(757.0, 742.7, 728.46, 666.0)),
    "mi300x-8x": inst("mi300x-8x", "amd", "MI300X", "MI300X.8X", 8, 1536,
        specs(10400.0, 1307.2, 9728), px(1416.5, 1389.9, 1363.2, 1336.0)),

    /* ---- Intel Gaudi-2 (4) ---- */
    "intel-gaudi-2-1x": inst("intel-gaudi-2-1x", "intel", "Gaudi-2", "Intel Gaudi-2.1x", 1, 96,
        specs(180.0, 60.0, 24), px(57.6, 46.8, 39.6, 34.2)),
    "intel-gaudi2-2x": inst("intel-gaudi2-2x", "intel", "Gaudi-2", "Intel Gaudi2.2x", 2, 192,
        specs(360.0, 120.0, 48), px(115.2, 93.6, 79.2, 68.4)),
    "intel-gaudi2-4x": inst("intel-gaudi2-4x", "intel", "Gaudi-2", "Intel Gaudi2.4x", 4, 384,
        specs(720.0, 240.0, 96), px(230.4, 187.2, 158.4, 136.8)),
    "intel-gaudi2-8x": inst("intel-gaudi2-8x", "intel", "Gaudi-2", "Intel Gaudi2.8x", 8, 768,
        specs(1440.0, 480.0, 192), px(460.8, 374.4, 316.8, 273.6)),

    /* ---- Intel Gaudi 3 (4) ---- */
    "intel-gaudi3-1x": inst("intel-gaudi3-1x", "intel", "Gaudi 3", "Intel Gaudi3.1x", 1, 128,
        specs(459.0, 229.0, 8), px(153.0, 134.1, 125.1, 117.0)),
    "intel-gaudi3-2x": inst("intel-gaudi3-2x", "intel", "Gaudi 3", "Intel Gaudi3.2x", 2, 256,
        specs(918.0, 458.0, 16), px(306.0, 268.2, 250.2, 234.0)),
    "intel-gaudi3-4x": inst("intel-gaudi3-4x", "intel", "Gaudi 3", "Intel Gaudi3.4x", 4, 512,
        specs(1836.0, 916.0, 32), px(612.0, 536.4, 500.4, 468.0)),
    "intel-gaudi3-8x": inst("intel-gaudi3-8x", "intel", "Gaudi 3", "Intel Gaudi3.8x", 8, 1024,
        specs(3672.0, 1832.0, 64), px(1224.0, 1072.8, 1000.8, 936.0)),

    /* ---- NVIDIA L40S (4) ---- */
    "l40s-1x": inst("l40s-1x", "nvidia", "L40S", "L40S.1x", 1, 48,
        specs(733.0, 91.6, 568), px(67.5, 49.5, 49.5, 45.0)),
    "l40s-2x": inst("l40s-2x", "nvidia", "L40S", "L40S.2x", 2, 96,
        specs(1466.0, 183.2, 1136), px(135.0, 99.0, 99.0, 90.0)),
    "l40s-4x": inst("l40s-4x", "nvidia", "L40S", "L40S.4x", 4, 192,
        specs(2932.0, 366.4, 2272), px(306.0, 198.0, 198.0, 180.0)),
    "l40s-8x": inst("l40s-8x", "nvidia", "L40S", "L40S.8x", 8, 384,
        specs(5864.0, 732.8, 4544), px(540.0, 396.0, 396.0, 360.0)),

    /* ---- NVIDIA L4 (4) ---- */
    "l4-1x": inst("l4-1x", "nvidia", "L4", "L4.1x", 1, 24,
        specs(242.0, 30.3, 240), px(44.86, 28.95, 26.75, 24.0)),
    "l4-2x": inst("l4-2x", "nvidia", "L4", "L4.2x", 2, 48,
        specs(484.0, 60.6, 480), px(98.84, 58.0, 54.0, 48.0)),
    "l4-4x": inst("l4-4x", "nvidia", "L4", "L4.4x", 4, 96,
        specs(968.0, 121.2, 960), px(196.68, 116.0, 108.0, 96.0)),
    "l4-8x": inst("l4-8x", "nvidia", "L4", "L4.8x", 8, 192,
        specs(1936.0, 242.4, 1920), px(507.94, 492.71, 457.15, 302.51)),

    /* ---- NVIDIA A100 80GB (4) ---- */
    "a100-80gb-1x": inst("a100-80gb-1x", "nvidia", "A100 80GB", "A100.80GB.1x", 1, 80,
        specs(312.0, 19.5, 432), px(135.9, 89.1, 85.5, 81.0)),
    "a100-80gb-2x": inst("a100-80gb-2x", "nvidia", "A100 80GB", "A100.80GB.2x", 2, 160,
        specs(624.0, 39.0, 864), px(271.8, 178.2, 171.0, 162.0)),
    "a100-80gb-4x": inst("a100-80gb-4x", "nvidia", "A100 80GB", "A100.80GB.4x", 4, 320,
        specs(1248.0, 78.0, 1728), px(543.6, 356.4, 342.0, 324.0)),
    "a100-80gb-8x": inst("a100-80gb-8x", "nvidia", "A100 80GB", "A100.80GB.8x", 8, 640,
        specs(2496.0, 156.0, 3456), px(1087.2, 712.8, 684.0, 648.0)),

    /* ---- NVIDIA A100 40GB (4) ---- */
    "a100-40gb-1x": inst("a100-40gb-1x", "nvidia", "A100 40GB", "A100.40GB.1x", 1, 40,
        specs(312.0, 19.5, 432), px(136.0, 89.0, 85.0, 81.0)),
    "a100-40gb-2x": inst("a100-40gb-2x", "nvidia", "A100 40GB", "A100.40GB.2x", 2, 80,
        specs(624.0, 39.0, 864), px(272.0, 178.0, 170.0, 162.0)),
    "a100-40gb-4x": inst("a100-40gb-4x", "nvidia", "A100 40GB", "A100.40GB.4x", 4, 160,
        specs(1248.0, 78.0, 1728), px(544.0, 356.0, 340.0, 324.0)),
    "a100-40gb-8x": inst("a100-40gb-8x", "nvidia", "A100 40GB", "A100.40GB.8x", 8, 320,
        specs(2496.0, 156.0, 3456), px(3175.66, 3175.66, 3175.66, 3175.66),
        { dataQuality: "As-listed 8x price is ~3x linear expectation vs 1x/2x/4x — kept verbatim, flag for portal re-check." }),

    /* ---- NVIDIA H100 PCIe (2) ---- */
    "h100pcie-1x": inst("h100pcie-1x", "nvidia", "H100 PCIe", "H100PCIe.1x", 1, 80,
        specs(1513.0, 51.0, 456), px(252.0, 234.0, 209.0, 185.0)),
    "h100pcie-8x": inst("h100pcie-8x", "nvidia", "H100 PCIe", "H100PCIe.8x", 8, 640,
        specs(12104.0, 408.0, 3648), px(2008.0, 1864.0, 1664.0, 1472.0)),

    /* ---- NVIDIA H100 SXM (4) ---- */
    "h100sxm-1x": inst("h100sxm-1x", "nvidia", "H100 SXM", "H100SXM.1x", 1, 80,
        specs(1979.0, 67.0, 528), px(153.0, 134.1, 125.1, 117.0)),
    "h100sxm-2x": inst("h100sxm-2x", "nvidia", "H100 SXM", "H100SXM.2x", 2, 160,
        specs(3958.0, 134.0, 1056), px(306.0, 268.2, 250.2, 234.0)),
    "h100sxm-4x": inst("h100sxm-4x", "nvidia", "H100 SXM", "H100SXM.4x", 4, 320,
        specs(7916.0, 268.0, 2112), px(612.0, 536.4, 500.4, 468.0)),
    "h100sxm-8x": inst("h100sxm-8x", "nvidia", "H100 SXM", "H100SXM.8x", 8, 640,
        specs(15832.0, 536.0, 4224), px(1224.0, 1072.8, 1000.8, 936.0)),

    /* ---- NVIDIA H100 NVL (4) ---- */
    "h100nvl-1x": inst("h100nvl-1x", "nvidia", "H100 NVL", "H100NVL.1x", 1, 94,
        specs(1671.0, 60.0, 456), px(140.0, 135.0, 118.0, 100.0)),
    "h100nvl-2x": inst("h100nvl-2x", "nvidia", "H100 NVL", "H100NVL.2X", 2, 188,
        specs(3342.0, 120.0, 912), px(337.48, 294.44, 274.04, 257.08)),
    "h100nvl-4x": inst("h100nvl-4x", "nvidia", "H100 NVL", "H100NVL.4X", 4, 376,
        specs(6684.0, 240.0, 1824), px(674.96, 588.88, 548.08, 514.16)),
    "h100nvl-8x": inst("h100nvl-8x", "nvidia", "H100 NVL", "H100NVL.8X", 8, 752,
        specs(13368.0, 480.0, 3648), px(1349.92, 1177.76, 1096.16, 1028.32)),

    /* ---- NVIDIA H200 SXM (4) ---- */
    "h200sxm-1x": inst("h200sxm-1x", "nvidia", "H200 SXM", "H200SXM.1x", 1, 141,
        specs(1979.0, 67.0, 528), px(140.0, 135.0, 118.0, 100.0)),
    "h200sxm-2x": inst("h200sxm-2x", "nvidia", "H200 SXM", "H200SXM.2X", 2, 282,
        specs(3958.0, 134.0, 1056), px(510.0, 448.0, 418.0, 390.0)),
    "h200sxm-4x": inst("h200sxm-4x", "nvidia", "H200 SXM", "H200SXM.4X", 4, 564,
        specs(7916.0, 268.0, 2112), px(1020.0, 896.0, 836.0, 780.0)),
    "h200sxm-8x": inst("h200sxm-8x", "nvidia", "H200 SXM", "H200SXM.8x", 8, 1128,
        specs(15832.0, 536.0, 4224), px(1125.0, 1100.0, 945.0, 785.0),
        { dataQuality: "As-listed SXM 8x differs from H200 PCIe 8x (Rs 3236.8) — kept verbatim per portal." }),

    /* ---- NVIDIA H200 PCIe (1) ---- */
    "h200pcie-8x": inst("h200pcie-8x", "nvidia", "H200 PCIe", "H200PCIE.8X", 8, 1128,
        specs(13368.0, 480.0, 3648), px(3236.8, 2737.0, 2665.6, 2380.0)),

    /* ---- NVIDIA H200 NVL (4) ---- */
    "h200nvl-1x": inst("h200nvl-1x", "nvidia", "H200 NVL", "H200NVL.1x", 1, 141,
        specs(1671.0, 60.0, 456), px(146.38, 143.61, 140.85, 138.09)),
    "h200nvl-2x": inst("h200nvl-2x", "nvidia", "H200 NVL", "H200NVL.2x", 2, 282,
        specs(3342.0, 120.0, 912), px(292.75, 287.23, 281.7, 276.18)),
    "h200nvl-4x": inst("h200nvl-4x", "nvidia", "H200 NVL", "H200NVL.4x", 4, 564,
        specs(6684.0, 240.0, 1824), px(585.5, 574.45, 563.41, 552.36)),
    "h200nvl-8x": inst("h200nvl-8x", "nvidia", "H200 NVL", "H200NVL.8x", 8, 1128,
        specs(13368.0, 480.0, 3648), px(1171.0, 1148.91, 1126.81, 1104.72)),

    /* ---- NVIDIA B200 SXM (4) ---- */
    "b200sxm-1x": inst("b200sxm-1x", "nvidia", "B200 SXM", "B200SXM.1x", 1, 180,
        specs(4500.0, 2200.0, 528), px(290.7, 277.2, 263.7, 251.1)),
    "b200sxm-2x": inst("b200sxm-2x", "nvidia", "B200 SXM", "B200SXM.2X", 2, 360,
        specs(9000.0, 4400.0, 1056), px(581.4, 554.4, 527.4, 502.2)),
    "b200sxm-4x": inst("b200sxm-4x", "nvidia", "B200 SXM", "B200SXM.4x", 4, 720,
        specs(18000.0, 8800.0, 2112), px(1162.8, 1108.8, 1054.8, 1004.4)),
    "b200sxm-8x": inst("b200sxm-8x", "nvidia", "B200 SXM", "B200SXM.8x", 8, 1440,
        specs(36000.0, 17600.0, 4224), px(2325.6, 2217.6, 2109.6, 2008.8)),

    /* ---- NVIDIA B300 SXM (4) — portal specs unpublished ---- */
    "b300sxm-1x": inst("b300sxm-1x", "nvidia", "B300 SXM", "B300SXM.1x", 1, null,
        specs(null, null, null), px(351.0, 342.0, 333.0, 319.5),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "b300sxm-2x": inst("b300sxm-2x", "nvidia", "B300 SXM", "B300SXM.2x", 2, null,
        specs(null, null, null), px(702.0, 684.0, 666.0, 639.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "b300sxm-4x": inst("b300sxm-4x", "nvidia", "B300 SXM", "B300SXM.4x", 4, null,
        specs(null, null, null), px(1404.0, 1368.0, 1332.0, 1278.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "b300sxm-8x": inst("b300sxm-8x", "nvidia", "B300 SXM", "B300SXM.8x", 8, null,
        specs(null, null, null), px(2808.0, 2736.0, 2664.0, 2556.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),

    /* ---- NVIDIA RTX PRO 6000 (4) — portal specs unpublished ---- */
    "rtx-pro-6000-1x": inst("rtx-pro-6000-1x", "nvidia", "RTX PRO", "RTX.PRO.6000.1x", 1, null,
        specs(null, null, null), px(114.6, 109.15, 103.95, 99.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "rtx-pro-6000-2x": inst("rtx-pro-6000-2x", "nvidia", "RTX PRO", "RTX.PRO.6000.2x", 2, null,
        specs(null, null, null), px(229.2, 218.3, 207.9, 198.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "rtx-pro-6000-4x": inst("rtx-pro-6000-4x", "nvidia", "RTX PRO", "RTX.PRO.6000.4x", 4, null,
        specs(null, null, null), px(458.4, 436.6, 415.8, 396.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),
    "rtx-pro-6000-8x": inst("rtx-pro-6000-8x", "nvidia", "RTX PRO", "RTX.PRO.6000.8x", 8, null,
        specs(null, null, null), px(916.8, 873.2, 831.6, 792.0),
        { dataQuality: "Portal lists 0 memory/specs — stored as null, price kept verbatim." }),

    /* ---- AWS Inferentia (4) ---- */
    "inferentia32gb-inf2-xlarge-1x": inst("inferentia32gb-inf2-xlarge-1x", "aws", "Inferentia", "Inferentia32GB.inf2.xlarge.1X", 1, 32,
        specs(190.0, 47.5, 2), px(79.6, 79.6, 79.6, 50.15)),
    "inferentia32gb-inf2-8xlarge-1x": inst("inferentia32gb-inf2-8xlarge-1x", "aws", "Inferentia", "Inferentia32GB.inf2.8xlarge.1X", 1, 32,
        specs(190.0, 47.5, 2), px(206.57, 206.57, 206.57, 130.17),
        { dataQuality: "Distinct instance type from inf2.xlarge.1X despite same cards/memory — kept as two rows per portal." }),
    "inferentia32gb-inf2-24xlarge-6x": inst("inferentia32gb-inf2-24xlarge-6x", "aws", "Inferentia", "Inferentia32GB.inf2.24xlarge.6X", 6, 192,
        specs(1140.0, 285.0, 12), px(681.35, 681.35, 681.35, 429.27)),
    "inferentia32gb-inf2-48xlarge-12x": inst("inferentia32gb-inf2-48xlarge-12x", "aws", "Inferentia", "Inferentia32GB.inf2.48xlarge.12X", 12, 384,
        specs(2280.0, 570.0, 24), px(1362.71, 1362.71, 1362.71, 858.53)),

    /* ---- AWS Trainium (3) ---- */
    "trainium-32gb-trn1-2xlarge-1x": inst("trainium-32gb-trn1-2xlarge-1x", "aws", "Trainium", "Trainium.32GB.trn1.2xlarge.1x", 1, 32,
        specs(190.0, 8.0, 2), px(130.21, 130.21, 130.21, 130.21)),
    "trainium-32gb-trn1-32xlarge-16x": inst("trainium-32gb-trn1-32xlarge-16x", "aws", "Trainium", "Trainium.32GB.trn1.32xlarge.16x", 16, 512,
        specs(3040.0, 128.0, 32), px(945.0, 945.0, 945.0, 945.0)),
    "trainium-32gb-trn1n-32xlarge-16x": inst("trainium-32gb-trn1n-32xlarge-16x", "aws", "Trainium", "Trainium.32GB.trn1n.32xlarge.16x", 16, 512,
        specs(3040.0, 128.0, 32), px(2511.78, 2511.78, 2511.78, 2511.78)),

    /* ---- GCP Trillium TPU v6e (3) ---- */
    "trillium-tpuv6e-1x": inst("trillium-tpuv6e-1x", "gcp", "Trillium.TPUv6e", "Trillium.TPUv6e.1X", 1, 32,
        specs(918.0, 153.0, 0), px(114.94, 112.34, 103.45, 87.6)),
    "trillium-tpuv6e-4x": inst("trillium-tpuv6e-4x", "gcp", "Trillium.TPUv6e", "Trillium.TPUv6e.4X", 4, 128,
        specs(3672.0, 612.0, 0), px(511.9, 511.9, 460.71, 357.6)),
    "trillium-tpuv6e-8x": inst("trillium-tpuv6e-8x", "gcp", "Trillium.TPUv6e", "Trillium.TPUv6e.8X", 8, 256,
        specs(7344.0, 1224.0, 0), px(1023.69, 1023.69, 921.32, 716.33))
};

/* ================= ACCESSORS (mirror modelService shape) ================= */

export function getGpuInstance(instanceId) {
    if (typeof instanceId !== "string" || !instanceId) return null;
    return GPU_INDIAAI_INSTANCES[instanceId] || null;
}

export function listGpuInstances() {
    return Object.values(GPU_INDIAAI_INSTANCES);
}

export function listGpuOems() {
    return Object.values(GPU_INDIAAI_OEMS);
}

export function getGpuSummary() {
    const all = listGpuInstances();
    const byOem = {};
    for (const inst of all) byOem[inst.oem] = (byOem[inst.oem] || 0) + 1;
    return {
        totalInstances: all.length,
        byOem,
        currency: GPU_INDIAAI_SOURCE.currency,
        unit: GPU_INDIAAI_SOURCE.unit,
        verifiedAt: GPU_INDIAAI_SOURCE.verifiedAt,
        source: GPU_INDIAAI_SOURCE.url,
        note: "INR-native. Default tier for v3 is onDemand."
    };
}
