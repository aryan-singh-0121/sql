import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adminToken, settings } = await req.json();

    if (!adminToken || !settings) {
      return new Response(JSON.stringify({ success: false, message: "Missing parameters" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update settings (excluding credentials - those are managed by admin-update-credentials)
    const { error } = await supabase
      .from("admin_settings")
      .update({
        youtube_links: settings.youtubeLinks,
        terms_link: settings.termsLink,
        home_video_url: settings.homeVideoUrl,
        home_image_url: settings.homeImageUrl,
        logo_url: settings.logoUrl,
        favicon_url: settings.faviconUrl,
        site_title: settings.siteTitle,
        instagram_url: settings.instagramUrl,
        instagram_popup_enabled: settings.instagramPopupEnabled,
        marquee_text: settings.marqueeText,
        practice_questions: settings.practiceQuestions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) {
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
