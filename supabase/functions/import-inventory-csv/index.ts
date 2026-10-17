import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Mapping = {
  sku: string;
  unit_price?: string;
  unit_cost?: string;
  quantity_on_hand?: string;
  quantity_allocated?: string;
  quantity_on_order?: string;
  quantity_atp?: string;
  quantity_ats?: string;
  description?: string;
  sales_description?: string;
  purchase_description?: string;
  manufacturer_part_number?: string;
  vendor?: string;
  lead_time_days?: string;
  minimum_order_quantity?: string;
  reorder_point?: string;
  is_taxable?: string;
  weight_oz?: string;
  volume_cubic_inches?: string;
  dimension_l?: string;
  dimension_w?: string;
  dimension_h?: string;
  packed_dimension_l?: string;
  packed_dimension_w?: string;
  packed_dimension_h?: string;
  packed_volume_cubic_inches?: string;
  packed_shape?: string;
  packed_diameter?: string;
  actual_packed_volume_cubic_inches?: string;
  paper_thickness_top?: string;
  paper_thickness_bottom?: string;
  paper_thickness_left?: string;
  paper_thickness_right?: string;
  paper_thickness_front?: string;
  paper_thickness_back?: string;
  paper_thickness_side?: string;
  paper_thickness_uniform?: string;
  consumption_last_12_months?: string;
  daily_consumption_rate?: string;
  visible_for_sale?: string;
  always_ship_stacked?: string;
  max_stack_quantity?: string;
  images?: string;
  images_front?: string;
  images_back?: string;
  images_special?: string;
  video_url?: string;
  created_by_source?: "current_user" | "column";
  created_by_column?: string;
};

type Row = Record<string, unknown>;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { rows, mapping }: { rows: Row[]; mapping: Mapping } = await req.json();

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "No rows provided" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!mapping?.sku) {
      return new Response(JSON.stringify({ error: "SKU mapping is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Use the caller's JWT so RLS applies and created_by uses the current user
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    // Current user
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    const currentUserId = userData.user.id;

    // Helpers
    const toNumber = (v: unknown): number | undefined => {
      if (v === null || v === undefined || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };

    const toBoolean = (v: unknown): boolean => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const lower = v.toLowerCase().trim();
        return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'y';
      }
      return Boolean(v);
    };

    const splitUrls = (val: unknown): string[] => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean).map(String);
      const s = String(val);
      // split by common separators
      return s
        .split(/[,;|\s]+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
    };

    const bucket = "inventory-images";
    let created = 0, updated = 0, imagesUploaded = 0;
    const errors: Array<{ sku?: string; error: string }> = [];

    for (const row of rows) {
      try {
        const skuRaw = row[mapping.sku];
        const sku = skuRaw === undefined || skuRaw === null ? "" : String(skuRaw).trim();
        if (!sku) {
          errors.push({ error: "Missing SKU" });
          continue;
        }

        const unit_price = mapping.unit_price ? toNumber(row[mapping.unit_price]) : undefined;
        const quantity_on_hand = mapping.quantity_on_hand ? toNumber(row[mapping.quantity_on_hand]) : undefined;
        const description = mapping.description ? (row[mapping.description] ?? undefined) : undefined;

        // Collect image URLs from mapped columns
        const imageUrls = mapping.images ? splitUrls(row[mapping.images]) : [];
        const frontUrls = mapping.images_front ? splitUrls(row[mapping.images_front]) : [];
        const backUrls = mapping.images_back ? splitUrls(row[mapping.images_back]) : [];
        const specialUrls = mapping.images_special ? splitUrls(row[mapping.images_special]) : [];

        // Ensure folder-safe path
        const slug = sku.replace(/[^a-zA-Z0-9-_]/g, "_");
        const uploadedPublicUrls: string[] = [];

        // Helper to upload a list of URLs into an optional perspective subfolder
        const uploadList = async (urls: string[], perspective?: string) => {
          for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
              const ab = await res.arrayBuffer();
              const contentType = res.headers.get("content-type") || "application/octet-stream";
              // Try to preserve extension when possible
              const extFromType = contentType.split("/")[1]?.split(";")[0] || "bin";
              let fileName = url.split("?")[0].split("/").pop() || `img_${i}.${extFromType}`;
              if (!/\.[a-zA-Z0-9]+$/.test(fileName)) {
                fileName = `${fileName}.${extFromType}`;
              }
              const folder = perspective ? `${slug}/${perspective}` : `${slug}`;
              const path = `${folder}/${fileName}`;

              // Upsert upload (overwrite if exists)
              // @ts-ignore upsert is supported in v2
              const { error: upErr } = await supabase.storage
                .from(bucket)
                .upload(path, new Uint8Array(ab), { contentType, upsert: true });
              if (upErr) throw upErr;

              const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
              if (pub?.publicUrl) {
                uploadedPublicUrls.push(pub.publicUrl);
                imagesUploaded += 1;
              }
            } catch (imgErr: any) {
              console.error("Image upload error", sku, url, imgErr?.message || imgErr);
              errors.push({ sku, error: `Image error for ${url}: ${imgErr?.message || imgErr}` });
            }
          }
        };

        // Upload in groups
        await uploadList(imageUrls);
        await uploadList(frontUrls, "front");
        await uploadList(backUrls, "back");
        await uploadList(specialUrls, "special");

        // Find existing item by SKU
        const { data: existing, error: selErr } = await supabase
          .from("inventory_items")
          .select("id, image_urls")
          .eq("sku", sku)
          .maybeSingle();
        if (selErr) throw selErr;

        if (existing?.id) {
          const updatePayload: Record<string, any> = {};
          if (unit_price !== undefined) updatePayload.unit_price = unit_price;
          if (quantity_on_hand !== undefined) updatePayload.quantity_on_hand = Math.trunc(quantity_on_hand);
          if (description !== undefined) updatePayload.sales_description = String(description);
          if (uploadedPublicUrls.length > 0) updatePayload.image_urls = uploadedPublicUrls;
          if (mapping.visible_for_sale && row[mapping.visible_for_sale] !== undefined && row[mapping.visible_for_sale] !== '') {
            updatePayload.visible_for_sale = toBoolean(row[mapping.visible_for_sale]);
          }
          if (mapping.always_ship_stacked && row[mapping.always_ship_stacked] !== undefined && row[mapping.always_ship_stacked] !== '') {
            updatePayload.always_ship_stacked = toBoolean(row[mapping.always_ship_stacked]);
          }
          if (mapping.max_stack_quantity && row[mapping.max_stack_quantity] !== undefined && row[mapping.max_stack_quantity] !== '') {
            const msq = Number(row[mapping.max_stack_quantity]);
            updatePayload.max_stack_quantity = Number.isFinite(msq) && msq > 0 ? Math.trunc(msq) : null;
          }

          const { error: updErr } = await supabase
            .from("inventory_items")
            .update(updatePayload)
            .eq("id", existing.id);
          if (updErr) throw updErr;
          updated += 1;
        } else {
          const insertPayload: Record<string, any> = {
            sku,
            unit_price: unit_price ?? 0,
            quantity_on_hand: Math.trunc(quantity_on_hand ?? 0),
            consumption_start_date: new Date().toISOString().split('T')[0], // Set to today for new items
            daily_consumption_rate: 0, // Will be calculated by consumption rate function
            created_by: currentUserId,
            visible_for_sale: mapping.visible_for_sale && row[mapping.visible_for_sale] !== undefined && row[mapping.visible_for_sale] !== '' 
              ? toBoolean(row[mapping.visible_for_sale]) 
              : true, // Default to true for new items
          };
          if (description !== undefined) insertPayload.sales_description = String(description);
          if (uploadedPublicUrls.length > 0) insertPayload.image_urls = uploadedPublicUrls;

          const { error: insErr } = await supabase.from("inventory_items").insert(insertPayload);
          if (insErr) throw insErr;
          created += 1;
        }
      } catch (rowErr: any) {
        console.error("Row error", rowErr?.message || rowErr);
        errors.push({ sku: String(row[mapping.sku] ?? ""), error: rowErr?.message || String(rowErr) });
      }
    }

    // Trigger global calculations after successful import
    let calculationResults = null;
    let calculationsTriggered = false;
    
    if (created > 0 || updated > 0) {
      try {
        console.log("Triggering post-import calculations...");
        const calcResponse = await fetch(`${supabaseUrl}/functions/v1/manual-calculation-trigger`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ triggerTTM: true, triggerReorder: true, triggerConsumption: true })
        });
        
        if (calcResponse.ok) {
          calculationResults = await calcResponse.json();
          calculationsTriggered = true;
          console.log("Post-import calculations completed:", calculationResults);
        } else {
          console.error("Post-import calculations failed:", await calcResponse.text());
        }
      } catch (calcError) {
        console.error("Error triggering post-import calculations:", calcError);
      }
    }

    return new Response(
      JSON.stringify({ 
        created, 
        updated, 
        imagesUploaded, 
        errorsCount: errors.length, 
        errors,
        calculationsTriggered,
        calculationResults
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("import-inventory-csv error", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message || "Unexpected error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});