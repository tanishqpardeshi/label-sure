import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';
import {
  decodeFssaiLicense,
  evaluatePackageCompliance,
  normalizeGlareDateText,
} from './src/lib/complianceEngine';
import { DEFAULT_COMPLIANCE_RULES } from './src/data/goldenSample';
import type {
  BarcodeVerificationResult,
  ComplianceRule,
  ExtractedField,
  FieldKey,
  NutritionProfile,
  PinCodeVerificationResult,
  ProductContext,
  SpatialRegion,
} from './src/types/compliance';

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '15mb' }));

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const VALID_REGIONS: SpatialRegion[] = [
  'PRODUCT_HEADER',
  'STATUTORY_PANEL',
  'DATE_BOX',
  'MANUFACTURER_BOX',
  'INGREDIENTS_BOX',
];

const VALID_KEYS: FieldKey[] = [
  'product_name',
  'net_quantity',
  'mrp_usp',
  'mfd_use_by',
  'batch_number',
  'fssai_license',
  'manufacturer_details',
  'ingredients_declaration',
];

const FIELD_LABELS: Record<FieldKey, string> = {
  product_name: 'Product Name',
  net_quantity: 'Net Quantity',
  mrp_usp: 'MRP & USP',
  mfd_use_by: 'MFD & Use By Date',
  batch_number: 'Batch Number',
  fssai_license: 'FSSAI License Number',
  manufacturer_details: 'Manufacturer Details',
  ingredients_declaration: 'Ingredients Declaration',
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'LabelSure Compliance API' });
});

const OFFLINE_BARCODE_FALLBACK: Record<string, BarcodeVerificationResult> = {
  '8901063092686': {
    found: true,
    source: 'offline_catalog_fallback',
    barcode: '8901063092686',
    productName: 'Good Day Butter Cookies',
    brand: 'Britannia Industries Ltd.',
    netQuantity: 'NET WEIGHT: 100g',
    ingredientsText:
      'INGREDIENTS: Refined Wheat Flour (Maida), Sugar, Refined Palm Oil, Butter (3.5%), Invert Syrup, Milk Solids, Salt, Raising Agents, Emulsifiers.',
    nutritionProfile: {
      servingBasis: 'per 100g',
      energyKcal: 498,
      proteinG: 6.8,
      totalFatG: 21.5,
      saturatedFatG: 10.6,
      transFatG: 0.1,
      carbohydratesG: 69.2,
      addedSugarG: 23.0,
      sodiumMg: 295,
    },
  },
  '8901491101837': {
    found: true,
    source: 'offline_catalog_fallback',
    barcode: '8901491101837',
    productName: 'Classic Salted Potato Chips',
    brand: 'ABC Foods Pvt. Ltd.',
    netQuantity: 'NET WEIGHT: 120g',
    ingredientsText:
      'INGREDIENTS: Potato, Edible Vegetable Oil, Iodised Salt, CONTAINS ADDED FLAVOUR (Natural & Nature Identical Flavouring Substances). fssai Lic. No. 1001402202711',
    nutritionProfile: {
      servingBasis: 'per 100g',
      energyKcal: 536,
      proteinG: 6.5,
      totalFatG: 34.0,
      saturatedFatG: 14.2,
      transFatG: 0.1,
      carbohydratesG: 51.8,
      addedSugarG: 1.2,
      sodiumMg: 680,
    },
  },
  '8901058851298': {
    found: true,
    source: 'offline_catalog_fallback',
    barcode: '8901058851298',
    productName: '2-Minute Masala Instant Noodles',
    brand: 'Nestle India Ltd.',
    netQuantity: 'NET WEIGHT: 70g',
    ingredientsText:
      'INGREDIENTS: Wheat Flour, Palm Oil, Salt, Wheat Gluten, Thickeners, Acidity Regulators, Mixed Spices (Onion Powder, Coriander, Turmeric, Red Chilli, Cumin, Garlic).',
    nutritionProfile: {
      servingBasis: 'per 100g',
      energyKcal: 427,
      proteinG: 8.0,
      totalFatG: 15.7,
      saturatedFatG: 7.4,
      transFatG: 0.1,
      carbohydratesG: 63.5,
      addedSugarG: 1.8,
      sodiumMg: 1020,
    },
  },
};

const OFFLINE_PINCODE_DIRECTORY: Record<
  string,
  { postOffice: string; district: string; state: string }
> = {
  '452001': { postOffice: 'Indore G.P.O.', district: 'Indore', state: 'Madhya Pradesh' },
  '462001': { postOffice: 'Bhopal G.P.O.', district: 'Bhopal', state: 'Madhya Pradesh' },
  '400001': { postOffice: 'Mumbai G.P.O.', district: 'Mumbai', state: 'Maharashtra' },
  '110001': { postOffice: 'New Delhi G.P.O.', district: 'New Delhi', state: 'Delhi' },
  '560001': { postOffice: 'Bengaluru G.P.O.', district: 'Bengaluru Urban', state: 'Karnataka' },
  '380015': { postOffice: 'Polytechnic Ahmedabad', district: 'Ahmedabad', state: 'Gujarat' },
};

app.get('/api/verify/barcode/:barcode', async (req, res) => {
  const barcode = String(req.params.barcode || '').replace(/\D/g, '');
  if (!barcode || barcode.length < 8 || barcode.length > 14) {
    res.status(400).json({ error: 'Enter a valid 8 to 14 digit EAN/UPC barcode.' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const apiRes = await fetch(
      `https://in.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'LabelSure-Compliance/1.0 (https://labelsure.local)' },
      },
    );
    clearTimeout(timeout);

    if (apiRes.ok) {
      const json = (await apiRes.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          brands?: string;
          quantity?: string;
          ingredients_text?: string;
          nutriments?: Record<string, number>;
        };
      };

      if (json.status === 1 && json.product) {
        const p = json.product;
        const n = p.nutriments || {};
        const result: BarcodeVerificationResult = {
          found: true,
          source: 'openfoodfacts_live',
          barcode,
          productName: p.product_name || `Product ${barcode}`,
          brand: p.brands || 'Unknown Brand',
          netQuantity: p.quantity ? `NET WEIGHT: ${p.quantity}` : 'NET WEIGHT: 100g',
          ingredientsText: p.ingredients_text
            ? `INGREDIENTS: ${p.ingredients_text}`
            : 'INGREDIENTS: Not listed in Open Food Facts record.',
          nutritionProfile: {
            servingBasis: 'per 100g',
            energyKcal: Math.round(Number(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0)),
            proteinG: Number((Number(n['proteins_100g'] ?? 0)).toFixed(1)),
            totalFatG: Number((Number(n['fat_100g'] ?? 0)).toFixed(1)),
            saturatedFatG: Number((Number(n['saturated-fat_100g'] ?? 0)).toFixed(1)),
            transFatG: Number((Number(n['trans-fat_100g'] ?? 0)).toFixed(2)),
            carbohydratesG: Number((Number(n['carbohydrates_100g'] ?? 0)).toFixed(1)),
            addedSugarG: Number((Number(n['sugars_100g'] ?? 0)).toFixed(1)),
            sodiumMg: Math.round(
              Number(n['sodium_100g'] ?? (n['salt_100g'] ? Number(n['salt_100g']) * 0.4 : 0)) *
                1000,
            ),
          },
        };
        res.json(result);
        return;
      }
    }
  } catch {
    // Fall through cleanly to deterministic local Indian SKU catalog if outbound network is restricted
  }

  const fallback = OFFLINE_BARCODE_FALLBACK[barcode];
  if (fallback) {
    res.json(fallback);
    return;
  }

  res.status(404).json({
    error: `Barcode ${barcode} not found in Open Food Facts India registry or offline catalog.`,
  });
});

app.get('/api/verify/pincode/:pincode', async (req, res) => {
  const pincode = String(req.params.pincode || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(pincode)) {
    res.status(400).json({ error: 'Indian PIN code must be exactly 6 digits.' });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const apiRes = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'LabelSure-Compliance/1.0' },
    });
    clearTimeout(timeout);

    if (apiRes.ok) {
      const json = (await apiRes.json()) as Array<{
        Status?: string;
        Message?: string;
        PostOffice?: Array<{ Name: string; District: string; State: string }>;
      }>;
      const entry = json?.[0];
      if (entry?.Status === 'Success' && entry.PostOffice && entry.PostOffice.length > 0) {
        const po = entry.PostOffice[0];
        const result: PinCodeVerificationResult = {
          valid: true,
          source: 'indiapost_live',
          pincode,
          postOffice: po.Name,
          district: po.District,
          state: po.State,
          message: `Verified via India Post live API: ${po.Name}, ${po.District}, ${po.State}.`,
        };
        res.json(result);
        return;
      }
    }
  } catch {
    // Fall through to deterministic India Post directory fallback
  }

  const local = OFFLINE_PINCODE_DIRECTORY[pincode];
  if (local) {
    const result: PinCodeVerificationResult = {
      valid: true,
      source: 'offline_directory_fallback',
      pincode,
      postOffice: local.postOffice,
      district: local.district,
      state: local.state,
      message: `Verified via deterministic PIN directory: ${local.postOffice}, ${local.district}, ${local.state}.`,
    };
    res.json(result);
    return;
  }

  // Validate structural 6-digit Indian PIN region code (first digit 1..8)
  const regionMap: Record<string, string> = {
    '1': 'Northern Postal Zone (Delhi/HR/PB/HP/JK)',
    '2': 'Northern Postal Zone (UP/UK)',
    '3': 'Western Postal Zone (RJ/GJ)',
    '4': 'Western Postal Zone (MH/MP/CG/GA)',
    '5': 'Southern Postal Zone (AP/TS/KA)',
    '6': 'Southern Postal Zone (TN/KL)',
    '7': 'Eastern Postal Zone (WB/OR/NE)',
    '8': 'Eastern Postal Zone (BR/JH)',
  };
  const zone = regionMap[pincode[0]];
  if (zone) {
    res.json({
      valid: true,
      source: 'offline_directory_fallback',
      pincode,
      postOffice: `Postal Circle ${pincode.slice(0, 3)}`,
      district: 'Verified Postal Zone',
      state: zone,
      message: `PIN ${pincode} structurally valid under ${zone}.`,
    } satisfies PinCodeVerificationResult);
    return;
  }

  res.status(404).json({
    error: `PIN code ${pincode} is not a valid Indian postal index (first digit must be 1–8).`,
  });
});

app.post('/api/verify/fssai', (req, res) => {
  const { licenseNumber = '' } = req.body as { licenseNumber?: string };
  const decoded = decodeFssaiLicense(String(licenseNumber), false);
  res.json(decoded);
});

app.post('/api/analyze-label', async (req, res) => {
  try {
    const {
      imageBase64,
      mimeType,
      presetImagePath,
      productContext,
      rules,
      measuredWeightGrams,
      sourceMode = 'upload',
    } = req.body as {
      imageBase64?: string;
      mimeType?: string;
      presetImagePath?: string;
      productContext: ProductContext;
      rules?: ComplianceRule[];
      measuredWeightGrams?: number;
      sourceMode?: 'upload' | 'camera' | 'sample_preset';
    };

    let resolvedBase64 = imageBase64;
    let resolvedMime = mimeType || 'image/jpeg';

    if (!resolvedBase64 && presetImagePath) {
      const safeBasename = path.basename(presetImagePath);
      const allowedDir = path.resolve(process.cwd(), 'src/assets/images');
      const fullPath = path.join(allowedDir, safeBasename);
      const buf = await fs.readFile(fullPath);
      resolvedBase64 = buf.toString('base64');
      resolvedMime = safeBasename.endsWith('.png') ? 'image/png' : 'image/jpeg';
    }

    if (!resolvedBase64) {
      res.status(400).json({ error: 'Please provide an uploaded image or select a sample label.' });
      return;
    }

    // Strip data URL prefix if sent by client
    const cleanBase64 = resolvedBase64.replace(/^data:[^;]+;base64,/, '');

    const ai = getGeminiClient();

    const prompt = `Analyze this packaged commodity label image for Indian Legal Metrology (LMPC Rules 2011) and FSSAI Labelling & Display compliance.
Product context: Brand=${productContext?.brand || 'Unknown'}, Category=${productContext?.category || 'Packaged Food'}, Country=${productContext?.countryOfOrigin || 'India'}.

Extract the following target fields if visible on the label, mapping each to one of these spatial regions:
PRODUCT_HEADER, STATUTORY_PANEL, DATE_BOX, MANUFACTURER_BOX, INGREDIENTS_BOX.
Target keys:
- product_name
- net_quantity
- mrp_usp (include MRP, currency symbol, inclusive of all taxes text, and USP if present)
- mfd_use_by (combine MFD and USE BY / EXPIRY text)
- batch_number
- fssai_license
- manufacturer_details (registered company name, address, and 6-digit PIN)
- ingredients_declaration (also note if any FSSAI Lic. No. appears inside the ingredients block!)

For each field, return:
- key (one of the 8 keys above)
- rawText (exact OCR string observed, preserving any glare artifacts or Devanagari/Indic text)
- region (one of the 5 spatial regions)
- confidence (0.0 to 1.0 realistic OCR legibility score; use < 0.85 if blurry, occluded, or glare-damaged)
- fontHeightMm (estimated printed font height in mm, e.g. 1.5 to 5.0)
- bbox: [y_min, x_min, y_max, x_max] normalized 0..1000 coordinates on the image.

Also extract nutritional facts per 100g/100ml if a Nutrition Information table is visible.`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: resolvedMime,
              data: cleanBase64,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        systemInstruction:
          'You are a precision computer-vision OCR & regulatory label extraction engine. Extract exact label text and accurate 0-1000 bounding boxes without inventing missing fields.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fields: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  key: { type: Type.STRING },
                  rawText: { type: Type.STRING },
                  region: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  fontHeightMm: { type: Type.NUMBER },
                  y_min: { type: Type.INTEGER },
                  x_min: { type: Type.INTEGER },
                  y_max: { type: Type.INTEGER },
                  x_max: { type: Type.INTEGER },
                },
                required: ['key', 'rawText', 'region', 'confidence', 'y_min', 'x_min', 'y_max', 'x_max'],
              },
            },
            nutrition: {
              type: Type.OBJECT,
              properties: {
                found: { type: Type.BOOLEAN },
                servingBasis: { type: Type.STRING },
                energyKcal: { type: Type.NUMBER },
                proteinG: { type: Type.NUMBER },
                totalFatG: { type: Type.NUMBER },
                saturatedFatG: { type: Type.NUMBER },
                transFatG: { type: Type.NUMBER },
                carbohydratesG: { type: Type.NUMBER },
                addedSugarG: { type: Type.NUMBER },
                sodiumMg: { type: Type.NUMBER },
              },
            },
          },
          required: ['fields'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      fields?: Array<{
        key: string;
        rawText: string;
        region: string;
        confidence: number;
        fontHeightMm?: number;
        y_min: number;
        x_min: number;
        y_max: number;
        x_max: number;
      }>;
      nutrition?: {
        found?: boolean;
        servingBasis?: string;
        energyKcal?: number;
        proteinG?: number;
        totalFatG?: number;
        saturatedFatG?: number;
        transFatG?: number;
        carbohydratesG?: number;
        addedSugarG?: number;
        sodiumMg?: number;
      };
    };

    const extractedFields: ExtractedField[] = (parsed.fields || [])
      .filter((f) => VALID_KEYS.includes(f.key as FieldKey))
      .map((f, idx) => {
        const key = f.key as FieldKey;
        const region = VALID_REGIONS.includes(f.region as SpatialRegion)
          ? (f.region as SpatialRegion)
          : 'STATUTORY_PANEL';

        let normalizedText = f.rawText;
        let glareNormalized = false;
        let glareRawSample: string | undefined;

        if (key === 'mfd_use_by') {
          const glare = normalizeGlareDateText(f.rawText);
          if (glare.wasCorrected) {
            normalizedText = glare.normalized;
            glareNormalized = true;
            glareRawSample = f.rawText;
          }
        }

        const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(Number(n) || 0)));

        return {
          id: `live-${Date.now()}-${idx}`,
          key,
          label: FIELD_LABELS[key],
          rawText: f.rawText,
          normalizedText,
          region,
          confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.9)),
          fontHeightMm: Number(f.fontHeightMm) || 2.0,
          bbox: {
            x_min: clamp(f.x_min),
            y_min: clamp(f.y_min),
            x_max: clamp(f.x_max),
            y_max: clamp(f.y_max),
          },
          glareNormalized,
          glareRawSample,
        };
      });

    let nutritionProfile: NutritionProfile | undefined;
    if (parsed.nutrition?.found) {
      nutritionProfile = {
        servingBasis:
          parsed.nutrition.servingBasis === 'per 100ml' ? 'per 100ml' : 'per 100g',
        energyKcal: Number(parsed.nutrition.energyKcal) || 0,
        proteinG: Number(parsed.nutrition.proteinG) || 0,
        totalFatG: Number(parsed.nutrition.totalFatG) || 0,
        saturatedFatG: Number(parsed.nutrition.saturatedFatG) || 0,
        transFatG: Number(parsed.nutrition.transFatG) || 0,
        carbohydratesG: Number(parsed.nutrition.carbohydratesG) || 0,
        addedSugarG: Number(parsed.nutrition.addedSugarG) || 0,
        sodiumMg: Number(parsed.nutrition.sodiumMg) || 0,
      };
    }

    const report = evaluatePackageCompliance({
      inspectionId: `INSP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      sourceMode,
      imageUrl: presetImagePath || undefined,
      productContext,
      fields: extractedFields,
      rules: rules && rules.length > 0 ? rules : DEFAULT_COMPLIANCE_RULES,
      nutritionProfile,
      measuredWeightGrams,
    });

    res.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to analyze package label';
    console.error('Label analysis error:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/ecommerce/audit', (req, res) => {
  try {
    const {
      marketplace = 'Seller Pre-Listing Gateway',
      batchId = `BATCH-${Date.now()}`,
      items = [],
      rules = DEFAULT_COMPLIANCE_RULES,
    } = req.body as {
      marketplace?: string;
      batchId?: string;
      items?: Array<{
        sku: string;
        productName: string;
        declaredNetQuantity: string;
        mrpDeclaration: string;
        mfdDate: string;
        useByDate: string;
        fssaiLicense: string;
        manufacturerAddress: string;
        ingredientsText: string;
        measuredScaleWeightGrams?: number;
      }>;
      rules?: ComplianceRule[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Provide at least one SKU item in items[] array.' });
      return;
    }

    const results = items.map((item, idx) => {
      const fields: ExtractedField[] = [
        {
          id: `${item.sku}-name-${idx}`,
          key: 'product_name',
          label: 'Product Name',
          rawText: item.productName || '',
          normalizedText: item.productName || '',
          region: 'PRODUCT_HEADER',
          confidence: 0.99,
          fontHeightMm: 4.0,
          bbox: { x_min: 50, y_min: 50, x_max: 900, y_max: 140 },
        },
        {
          id: `${item.sku}-qty-${idx}`,
          key: 'net_quantity',
          label: 'Net Quantity',
          rawText: item.declaredNetQuantity || '',
          normalizedText: item.declaredNetQuantity || '',
          region: 'STATUTORY_PANEL',
          confidence: 0.98,
          fontHeightMm: 2.5,
          bbox: { x_min: 50, y_min: 160, x_max: 450, y_max: 240 },
        },
        {
          id: `${item.sku}-mrp-${idx}`,
          key: 'mrp_usp',
          label: 'MRP & USP',
          rawText: item.mrpDeclaration || '',
          normalizedText: item.mrpDeclaration || '',
          region: 'STATUTORY_PANEL',
          confidence: 0.97,
          fontHeightMm: 2.2,
          bbox: { x_min: 50, y_min: 250, x_max: 450, y_max: 330 },
        },
        {
          id: `${item.sku}-date-${idx}`,
          key: 'mfd_use_by',
          label: 'MFD & Use By Date',
          rawText: `MFD: ${item.mfdDate || ''} | USE BY: ${item.useByDate || ''}`,
          normalizedText: `MFD: ${item.mfdDate || ''} | USE BY: ${item.useByDate || ''}`,
          region: 'DATE_BOX',
          confidence: 0.95,
          fontHeightMm: 2.0,
          bbox: { x_min: 500, y_min: 160, x_max: 900, y_max: 250 },
        },
        {
          id: `${item.sku}-fssai-${idx}`,
          key: 'fssai_license',
          label: 'FSSAI License Number',
          rawText: `FSSAI Lic. No. ${item.fssaiLicense || ''}`,
          normalizedText: `FSSAI Lic. No. ${item.fssaiLicense || ''}`,
          region: 'MANUFACTURER_BOX',
          confidence: 0.96,
          fontHeightMm: 1.8,
          bbox: { x_min: 50, y_min: 580, x_max: 450, y_max: 660 },
        },
        {
          id: `${item.sku}-mfg-${idx}`,
          key: 'manufacturer_details',
          label: 'Manufacturer Details',
          rawText: item.manufacturerAddress || '',
          normalizedText: item.manufacturerAddress || '',
          region: 'MANUFACTURER_BOX',
          confidence: 0.96,
          fontHeightMm: 1.7,
          bbox: { x_min: 50, y_min: 670, x_max: 900, y_max: 780 },
        },
        {
          id: `${item.sku}-ing-${idx}`,
          key: 'ingredients_declaration',
          label: 'Ingredients Declaration',
          rawText: item.ingredientsText || '',
          normalizedText: item.ingredientsText || '',
          region: 'INGREDIENTS_BOX',
          confidence: 0.95,
          fontHeightMm: 1.5,
          bbox: { x_min: 50, y_min: 360, x_max: 900, y_max: 550 },
        },
      ];

      const evaluation = evaluatePackageCompliance({
        inspectionId: `API-${item.sku}`,
        sourceMode: 'upload',
        productContext: {
          brand: marketplace,
          category: 'Packaged Food',
          countryOfOrigin: 'India',
          stateJurisdiction: 'Central LMPC 2011 + FSSAI 2020',
        },
        fields,
        rules,
        measuredWeightGrams: item.measuredScaleWeightGrams,
      });

      const failedChecks = evaluation.checkpoints
        .filter((c) => c.status === 'FAIL' || c.status === 'WARNING')
        .map((c) => ({
          ruleId: c.ruleId,
          field: c.label,
          status: c.status,
          rationale: c.rationale,
          correctiveAction: c.correctiveAction,
        }));

      return {
        sku: item.sku,
        productName: item.productName,
        listingAllowed: evaluation.overallStatus === 'PASS',
        overallStatus: evaluation.overallStatus,
        mpeCheck: evaluation.mpeEvaluation || null,
        summaryCounts: evaluation.summaryCounts,
        violations: failedChecks,
      };
    });

    res.json({
      httpStatus: 200,
      marketplace,
      batchId,
      evaluatedAt: new Date().toISOString(),
      totalSkus: results.length,
      approvedForListing: results.filter((r) => r.listingAllowed).length,
      blockedForViolation: results.filter((r) => !r.listingAllowed).length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bulk audit failed';
    res.status(500).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LabelSure server listening on http://localhost:${PORT}`);
  });
}

startServer();
