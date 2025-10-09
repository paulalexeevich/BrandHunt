import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const email = process.env.FOODGRAPH_EMAIL;
    const password = process.env.FOODGRAPH_PASSWORD;

    if (!email || !password) {
      return NextResponse.json({
        error: 'Missing credentials',
        hasEmail: !!email,
        hasPassword: !!password,
      }, { status: 500 });
    }

    // Try to authenticate
    const response = await fetch('https://api.foodgraph.com/v1/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        password,
        includeRefreshToken: true 
      }),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      response: responseData,
      emailUsed: email,
      passwordLength: password.length,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Exception occurred',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

