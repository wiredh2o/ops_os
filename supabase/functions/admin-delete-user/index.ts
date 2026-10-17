import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteUserRequest {
  userId: string
}

interface DeleteUserResponse {
  success: boolean
  action: 'deleted' | 'deactivated'
  message: string
  error?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { userId }: DeleteUserRequest = await req.json()
    
    if (!userId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User ID is required' 
        } as DeleteUserResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Create admin client for auth operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Create regular client for public table operations
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    console.log(`Processing deletion request for user: ${userId}`)

    // Check if user exists and get their auth status
    const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(userId)
    
    if (authError) {
      console.error('Error fetching auth user:', authError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to fetch user: ${authError.message}` 
        } as DeleteUserResponse),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!authUser?.user) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'User not found' 
        } as DeleteUserResponse),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const user = authUser.user
    
    // Check if user has completed signup
    const hasEmailConfirmed = !!user.email_confirmed_at
    const hasPassword = !!user.encrypted_password
    const hasCompletedSignup = hasEmailConfirmed && hasPassword

    console.log(`User signup status - Email confirmed: ${hasEmailConfirmed}, Has password: ${hasPassword}, Completed: ${hasCompletedSignup}`)

    if (!hasCompletedSignup) {
      // User never completed signup - delete completely
      console.log('User never completed signup, performing complete deletion')
      
      // Delete from public tables first (including ALL failed invites for this email)
      const deletePromises = [
        userClient.from('user_roles').delete().eq('user_id', userId),
        userClient.from('profiles').delete().eq('id', userId),
        // Clean up ALL pending invites for this email (not just pending status)
        userClient.from('pending_invites').delete().eq('email', user.email)
      ]

      const results = await Promise.allSettled(deletePromises)
      
      // Log any errors but continue with auth deletion
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`Error deleting from table ${index}:`, result.reason)
        }
      })

      // Delete from auth.users (requires admin privileges)
      const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
      
      if (deleteAuthError) {
        console.error('Error deleting auth user:', deleteAuthError)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to delete user: ${deleteAuthError.message}` 
          } as DeleteUserResponse),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('User completely deleted successfully')
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'deleted',
          message: 'User was completely deleted (never completed signup)' 
        } as DeleteUserResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      // User has completed signup - deactivate only
      console.log('User has completed signup, performing deactivation')
      
      const { error: deactivateError } = await userClient
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId)

      if (deactivateError) {
        console.error('Error deactivating user:', deactivateError)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Failed to deactivate user: ${deactivateError.message}` 
          } as DeleteUserResponse),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      console.log('User deactivated successfully')
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'deactivated',
          message: 'User was deactivated (completed signup - can be reactivated)' 
        } as DeleteUserResponse),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      } as DeleteUserResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})