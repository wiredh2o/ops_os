import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const grokApiKey = Deno.env.get('GROK_API_KEY');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyId, imageUrl } = await req.json();
    
    if (!grokApiKey) {
      throw new Error('Grok API key not configured');
    }

    console.log('Processing OCR for company:', companyId);
    console.log('File URL:', imageUrl);

    // Get signed URL for the document
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('sales-tax-licenses')
      .createSignedUrl(imageUrl, 300); // 5 minutes

    if (urlError || !signedUrlData?.signedUrl) {
      console.error('Error creating signed URL:', urlError);
      throw new Error('Failed to get signed URL for document');
    }

    console.log('Created signed URL successfully');

    // Process with Grok Vision
    const ocrResponse = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${grokApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'grok-vision-beta',
        messages: [
          {
            role: 'system',
            content: 'You are an OCR system specialized in extracting information from sales tax licenses and permits. This could be an image or PDF document. Extract the expiration date and return it in YYYY-MM-DD format. Look for terms like "expires", "expiration", "valid until", "good through" etc. IMPORTANT: Expiration dates are often displayed across multiple lines (e.g., "December" on one line and "2025" on the next line, or "12/31" on one line and "2025" below). Look for date components that may be split across lines and combine them. Also provide any other relevant details like license number, state, etc. Return the response as JSON with fields: expiration_date (YYYY-MM-DD format), license_number, state, issuing_authority, and confidence_score (0-1). If you cannot find an expiration date, set expiration_date to null and explain why in a notes field.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Please extract the expiration date and other relevant information from this sales tax license document. This may be an image or PDF. Look carefully for any dates that indicate when this license expires.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: signedUrlData.signedUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1
      }),
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('Grok API error:', ocrResponse.status, errorText);
      throw new Error(`Grok API error: ${ocrResponse.statusText} - ${errorText}`);
    }

    const ocrData = await ocrResponse.json();
    const extractedText = ocrData.choices[0].message.content;
    
    console.log('OCR Response:', extractedText);

    // Parse the JSON response
    let parsedData;
    try {
      parsedData = JSON.parse(extractedText);
    } catch (e) {
      // Fallback parsing if JSON is malformed
      console.log('Failed to parse JSON, using fallback parsing. Raw response:', extractedText);
      
      // Try to extract date patterns from the raw text
      const datePatterns = [
        /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/g,
        /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/g,
        /(expires?[:\s]+\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi,
        /(expiration[:\s]+\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/gi
      ];
      
      let extractedDate = null;
      for (const pattern of datePatterns) {
        const match = extractedText.match(pattern);
        if (match) {
          extractedDate = match[0];
          break;
        }
      }
      
      parsedData = {
        expiration_date: extractedDate,
        license_number: null,
        state: null,
        issuing_authority: null,
        confidence_score: 0.3,
        raw_text: extractedText,
        notes: 'JSON parsing failed, attempted pattern matching'
      };
    }

    // Update company record with OCR data
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        sales_tax_license_expires_at: parsedData.expiration_date,
        sales_tax_license_ocr_data: parsedData,
        sales_tax_license_ocr_processed_at: new Date().toISOString()
      })
      .eq('id', companyId);

    if (updateError) {
      throw new Error(`Failed to update company: ${updateError.message}`);
    }

    console.log('Successfully processed OCR for company:', companyId);

    return new Response(JSON.stringify({
      success: true,
      data: parsedData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-license-ocr:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});