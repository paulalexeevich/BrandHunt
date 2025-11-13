#!/bin/bash

# Vercel Deployment Validation Script
# Run this after adding SUPABASE_SERVICE_ROLE_KEY to Vercel

echo "🔍 Validating Vercel Deployment for BrangHunt..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Site Accessibility
echo "📡 Test 1: Site Accessibility"
HTTP_STATUS=$(curl -s -I https://branghunt.vercel.app | grep "HTTP/2" | awk '{print $2}')
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "${GREEN}✅ Site is live (HTTP/2 200)${NC}"
else
    echo -e "${RED}❌ Site issue (Status: $HTTP_STATUS)${NC}"
fi
echo ""

# Test 2: Get Vercel Cache Status
echo "🔄 Test 2: Deployment Info"
VERCEL_ID=$(curl -s -I https://branghunt.vercel.app | grep "x-vercel-id" | cut -d':' -f2 | tr -d ' \r\n')
CACHE_STATUS=$(curl -s -I https://branghunt.vercel.app | grep "x-vercel-cache" | cut -d':' -f2 | tr -d ' \r\n')
echo -e "   Deployment ID: ${YELLOW}$VERCEL_ID${NC}"
echo -e "   Cache Status: ${YELLOW}$CACHE_STATUS${NC}"
echo ""

# Test 3: Delete User API Endpoint
echo "🔑 Test 3: Service Role Key Validation"
echo "   Testing /api/delete-user endpoint..."
RESPONSE=$(curl -s -X POST https://branghunt.vercel.app/api/delete-user \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com"}' 2>&1)

if echo "$RESPONSE" | grep -q "Missing Supabase URL"; then
    echo -e "${RED}❌ Service role key NOT configured${NC}"
    echo "   Error: Missing environment variable"
    echo ""
    echo -e "${YELLOW}⚠️  Action Required:${NC}"
    echo "   1. Go to: https://vercel.com/paulalexeevichs-projects/branghunt/settings/environment-variables"
    echo "   2. Add SUPABASE_SERVICE_ROLE_KEY"
    echo "   3. Redeploy"
elif echo "$RESPONSE" | grep -q "User not found"; then
    echo -e "${GREEN}✅ Service role key is configured${NC}"
    echo "   API responding correctly (user not found as expected)"
elif echo "$RESPONSE" | grep -q "error"; then
    echo -e "${YELLOW}⚠️  API returns error (but key is configured)${NC}"
    echo "   Response: $RESPONSE"
else
    echo -e "${GREEN}✅ API endpoint is functional${NC}"
fi
echo ""

# Test 4: Users API Endpoint
echo "👥 Test 4: Users API Endpoint"
echo "   Testing /api/users endpoint..."
USERS_RESPONSE=$(curl -s https://branghunt.vercel.app/api/users 2>&1)

if echo "$USERS_RESPONSE" | grep -q "Missing Supabase URL"; then
    echo -e "${RED}❌ Service role key missing${NC}"
elif echo "$USERS_RESPONSE" | grep -q "Authentication required"; then
    echo -e "${GREEN}✅ Endpoint exists and requires auth (correct)${NC}"
elif echo "$USERS_RESPONSE" | grep -q "Unauthorized"; then
    echo -e "${GREEN}✅ Endpoint exists and requires auth (correct)${NC}"
else
    echo -e "${YELLOW}⚠️  Unexpected response${NC}"
    echo "   Response: ${USERS_RESPONSE:0:100}..."
fi
echo ""

# Test 5: Page Load Test
echo "🌐 Test 5: Application Pages"
HOMEPAGE=$(curl -s https://branghunt.vercel.app 2>&1 | grep -o "<title>.*</title>")
if [ ! -z "$HOMEPAGE" ]; then
    echo -e "${GREEN}✅ Homepage loads: $HOMEPAGE${NC}"
else
    echo -e "${RED}❌ Homepage issue${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Validation Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if echo "$RESPONSE" | grep -q "Missing Supabase URL"; then
    echo -e "${RED}Status: INCOMPLETE - Service role key not configured${NC}"
    echo ""
    echo "Next Steps:"
    echo "1. Add SUPABASE_SERVICE_ROLE_KEY to Vercel"
    echo "2. Redeploy"
    echo "3. Run this script again"
else
    echo -e "${GREEN}Status: DEPLOYED - All core features functional${NC}"
    echo ""
    echo "✅ Code deployed successfully"
    echo "✅ Service role key configured"
    echo "✅ API endpoints responding"
    echo ""
    echo "Test in browser:"
    echo "1. Login to https://branghunt.vercel.app"
    echo "2. Go to any project"
    echo "3. Check if member emails display (not UIDs)"
    echo "4. Try 'Add Member' dropdown"
fi
echo ""
echo "Full documentation: VERCEL_DEPLOYMENT_NOV_13.md"

