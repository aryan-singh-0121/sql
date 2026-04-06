import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { currentPassword, currentPasscode, newUsername, newPassword, newPasscode } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch current credentials to verify identity
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

    // Verify current credentials before allowing update
    if (currentPassword !== creds.password || currentPasscode !== creds.passcode) {
      return new Response(JSON.stringify({ success: false, message: "Current credentials invalid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const updatedCreds = {
      username: newUsername?.trim() || creds.username,
      password: newPassword?.trim() || creds.password,
      passcode: newPasscode?.trim() || creds.passcode,
    };

    const { error: updateError } = await supabase
      .from("admin_settings")
      .update({ credentials: updatedCreds, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (updateError) {
      return new Response(JSON.stringify({ success: false, message: "Update failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: "Bad request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
