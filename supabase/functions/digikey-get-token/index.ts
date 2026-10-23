import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { loadTenantKeys } from "../_shared/tenant-integrations.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DIGIKEY_TOKEN_URL = "https://api.digikey.com/v1/oauth2/token";

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TENANT_KEYS = await loadTenantKeys(req, ['digikey']);
    const clientId = TENANT_KEYS['DIGIKEY_CLIENT_ID'];
    const clientSecret = TENANT_KEYS['DIGIKEY_CLIENT_SECRET'];

    if (!clientId || !clientSecret) {
      throw new Error("DigiKey API credentials are not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for existing valid token
    const { data: existingToken } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'digikey_access_token')
      .eq('is_active', true)
      .maybeSingle();

    if (existingToken?.setting_value) {
      try {
        const tokenData = JSON.parse(existingToken.setting_value);
        const expiresAt = new Date(tokenData.expires_at);
        
        // Return existing token if still valid (with 5 min buffer)
        if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
          return new Response(
            JSON.stringify({
              success: true,
              accessToken: tokenData.access_token,
              expiresAt: tokenData.expires_at,
              cached: true,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
      } catch (e) {
        console.log("Existing token invalid, fetching new one");
      }
    }

    // Request new token using Client Credentials flow
    const tokenResponse = await fetch(DIGIKEY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("DigiKey token error:", errorText);
      throw new Error(`Failed to obtain DigiKey access token: ${tokenResponse.status}`);
    }

    const tokenData: TokenResponse = await tokenResponse.json();
    console.log("DigiKey token obtained, expires in:", tokenData.expires_in, "seconds");

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store token in system_settings
    const tokenStorage = {
      access_token: tokenData.access_token,
      expires_at: expiresAt.toISOString(),
      token_type: tokenData.token_type,
    };

    // Check if setting exists
    const { data: existing } = await supabase
      .from('system_settings')
      .select('id')
      .eq('setting_key', 'digikey_access_token')
      .maybeSingle();

    if (existing) {
      await supabase
        .from('system_settings')
        .update({
          setting_value: JSON.stringify(tokenStorage),
          updated_at: new Date().toISOString(),
        })
        .eq('setting_key', 'digikey_access_token');
    } else {
      await supabase
        .from('system_settings')
        .insert({
          setting_key: 'digikey_access_token',
          setting_value: JSON.stringify(tokenStorage),
          description: 'DigiKey OAuth access token (auto-managed)',
          is_active: true,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        accessToken: tokenData.access_token,
        expiresAt: expiresAt.toISOString(),
        cached: false,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );

  } catch (error: any) {
    console.error("Error in digikey-get-token:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
