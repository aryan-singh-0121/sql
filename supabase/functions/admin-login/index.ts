import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { username, password, passcode } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("admin_settings")
      .select("credentials")
      .eq("id", 1)
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ success: false, message: "Server error" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const creds = data.credentials as { username: string; password: string; passcode: string };

    if (username === creds.username && password === creds.password && passcode === creds.passcode) {
      // Generate a simple admin token (timestamp + random)
      const token = crypto.randomUUID();
      return new Response(JSON.stringify({ success: true, token }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, message: "Invalid credentials" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "Bad request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
