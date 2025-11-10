# AI Filtering Refinement: Stricter Product Matching

**Date:** November 10, 2025  
**Commit:** a9ec1b6

## Problem Statement

The AI filtering system was incorrectly classifying products as "ALMOST_SAME" when they had different flavors/variants or significantly different sizes. This caused false positives where different products were being matched.

### Case Studies

**Case 1: Same Product, Minor Packaging Variation** ✅ Should be ALMOST_SAME
- **Image 1:** Secret Clinical Dry Spray "Completely Clean" 3.8oz - "DOCTOR RECOMMENDED"
- **Image 2:** Secret Clinical Dry Spray "Completely Clean" 3.8oz - "#1 SPRAY PROTECTION" + "72 HR SWEAT PROTECTION"
- **Analysis:** Same exact product (brand, variant, size), only claim text differs (packaging refresh)
- **Expected:** ALMOST_SAME ✓

**Case 2: Different Variants** ❌ Should be NOT_MATCH
- **Image 1:** Secret Clinical Dry Spray "Complete Clean" 3.8oz
- **Image 2:** Secret Clinical Dry Spray "Light & Fresh" 3.8oz
- **Analysis:** Same brand and size, but DIFFERENT variants/flavors
- **Expected:** NOT_MATCH (was incorrectly ALMOST_SAME before)

## Solution

Redefined the three-tier matching system with stricter criteria for ALMOST_SAME:

### Updated Definitions

#### 1. IDENTICAL (unchanged)
Both products are EXACTLY the same:
- Same brand, product name, flavor/variant, size, packaging design
- All details match perfectly

#### 2. ALMOST_SAME (stricter)
Same EXACT product with minor packaging variations:

**MUST MATCH (no exceptions):**
- ✅ Brand name
- ✅ Product name
- ✅ Flavor/variant
- ✅ Package type
- ✅ Size (very close or same, within similar range)

**CAN DIFFER (acceptable variations):**
- 📦 Visual design (almost identical, minor refresh)
- 📝 Claim text ("Doctor Recommended" vs "Spray Protection")
- 🌍 Regional variations
- 🔄 Packaging updates/refreshes

**Key Insight:** ALMOST_SAME is for the **SAME PRODUCT** with cosmetic packaging changes, NOT for close variants.

#### 3. NOT_MATCH (expanded)
Different products - now explicitly includes:
- ❌ Different flavor/variant (e.g., "Complete Clean" vs "Light & Fresh")
- ❌ Significantly different size (e.g., 3.8oz vs 10oz)
- ❌ Different product types/lines
- ❌ Different brands

## Implementation

### File Modified
`lib/gemini.ts` - `compareProductImages()` function prompt

### Key Changes

1. **Stricter ALMOST_SAME criteria:**
   ```
   - MUST match: brand, product name, flavor/variant, package type
   - Very close or same size (within similar range, even if unclear/blurry)
   - Almost identical visual design
   - Same meaning in claims/benefits (wording may differ)
   ```

2. **Explicit NOT_MATCH cases:**
   ```
   - Different flavor/variant = NOT_MATCH (even if same brand/size)
   - Significantly different size = NOT_MATCH (even if same brand/flavor)
   ```

3. **Updated Examples:**
   ```javascript
   // ALMOST_SAME example
   {
     matchStatus: "almost_same",
     confidence: 0.9,
     visualSimilarity: 0.85,
     reason: "Same Secret Complete Clean 3.8oz, minor claim text difference"
   }
   
   // NOT_MATCH example (previously might have been ALMOST_SAME)
   {
     matchStatus: "not_match",
     confidence: 0.95,
     visualSimilarity: 0.7,
     reason: "Same brand/size but different scent: Fresh vs Powder"
   }
   ```

## Expected Impact

### Behavior Changes

| Scenario | Old Behavior | New Behavior | Correct? |
|----------|-------------|--------------|----------|
| Same product, claim text differs | ALMOST_SAME | ALMOST_SAME | ✅ Yes |
| Same brand/size, different flavor | ALMOST_SAME | NOT_MATCH | ✅ Fixed |
| Same brand/flavor, different size | ALMOST_SAME | NOT_MATCH | ✅ Fixed |
| Identical products | IDENTICAL | IDENTICAL | ✅ Yes |

### Match Quality Improvements

1. **Reduced False Positives:** Different variants will no longer match
2. **Stricter Size Matching:** Only similar sizes pass (tolerates blur/uncertainty)
3. **Flavor/Variant Enforcement:** Must be exact same variant
4. **Clearer Intent:** ALMOST_SAME = packaging variation, NOT different product

### Visual Similarity Scores

Updated guidance for Gemini:
- **0.9-1.0:** Identical products
- **0.7-0.9:** Almost same (packaging updates) ← Stricter interpretation
- **0.3-0.6:** Same brand, different variant ← These are NOT_MATCH
- **0.0-0.3:** Different brands

## Critical Matching Criteria

For ALMOST_SAME match, ALL must be true:
1. ✅ Same brand name (exact or very close)
2. ✅ Same product name
3. ✅ Same flavor/variant (e.g., both "Complete Clean", not "Fresh" vs "Clean")
4. ✅ Same package type (spray, stick, roll-on, etc.)
5. ✅ Very close size (similar oz/ml, tolerates blurriness)
6. ✅ Almost identical visual design
7. ✅ Same meaning in claims (wording differences OK)

**If ANY critical attribute mismatches → NOT_MATCH**

## Testing Recommendations

Test with these product pairs:

### Should Match (ALMOST_SAME)
- [ ] Same product, "New Formula" vs "Original Formula" label
- [ ] Same product, "Dermatologist Recommended" vs "Doctor Recommended"
- [ ] Same product, old packaging vs refreshed packaging
- [ ] Same product, US version vs Canadian version (same variant)

### Should NOT Match
- [ ] "Original" vs "Mint" flavor (same brand/size)
- [ ] "Unscented" vs "Fresh Scent" (same brand/size)
- [ ] "3.8oz" vs "10oz" (same brand/flavor)
- [ ] "Stick" vs "Spray" (same brand/variant/size)
- [ ] "Complete Clean" vs "Light & Fresh" (your Case 2)

## Prompt Engineering Notes

**Conciseness Strategy:**
- Used bullet points with "MUST match" vs "CAN differ"
- Provided specific example from user's case (Secret Clinical)
- Explicit rules for edge cases
- Clear visual similarity scales

**Coverage:**
- ✅ Brand matching
- ✅ Variant/flavor matching (strict)
- ✅ Size matching (tolerant of blur)
- ✅ Package type
- ✅ Visual design similarity
- ✅ Claim text (meaning vs exact wording)

**Kept Short While Comprehensive:**
- 47 lines for complete definition
- Clear examples for each case
- No ambiguity in critical rules

## Future Considerations

1. **Size Tolerance:** Current definition says "very close or same" - may need to define threshold (e.g., within 20% or same general size tier)

2. **Package Type Variations:** Some products have "same" variant in different formats (stick vs gel). Currently these are correctly NOT_MATCH, but user may want separate handling.

3. **Brand Name Variations:** "Secret" vs "Secret Clinical" - are these different brands? Current system treats as different.

4. **Regional Text:** Products with foreign language text but same product - should match as ALMOST_SAME.

## Commit Details

**Files Changed:** 1  
**Lines Changed:** +18 insertions, -18 deletions  
**Commit Hash:** a9ec1b6

**Git Message:**
```
Refine AI filtering: ALMOST_SAME requires exact product match (brand+variant+size), 
flavor/size mismatches = NOT_MATCH
```

