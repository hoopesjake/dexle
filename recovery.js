(async () => {
  "use strict";

  const $ = id => document.getElementById(id);
  const cfg = window.DEXLE_SUPABASE || {};
  const message = (id, text, error = false) => {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle("error", error);
    el.hidden = !text;
  };

  if (!window.supabase || !cfg.url || !cfg.publishableKey) {
    message("recoveryMessage", "Account recovery is temporarily unavailable.", true);
    return;
  }

  const client = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const recoveryLink = /(?:[?#&](?:code|token_hash|access_token)=)|(?:[?#&]type=recovery)/.test(location.href);
  const linkError = new URLSearchParams(location.hash.slice(1)).get("error_description") ||
    new URLSearchParams(location.search).get("error_description");

  async function showReset(user) {
    localStorage.removeItem("dexleRecoveryPending");
    $("recoveryRequest").hidden = true;
    $("recoveryReset").hidden = false;
    const { data: profile } = await client.from("profiles")
      .select("username").eq("user_id", user.id).maybeSingle();
    if (profile?.username) {
      $("recoveredUsername").textContent = `Your username is ${profile.username}`;
      $("recoveredUsername").hidden = false;
    }
  }

  $("recoveryRequestForm").onsubmit = async event => {
    event.preventDefault();
    const button = $("recoverySend");
    button.disabled = true;
    message("recoveryMessage", "");
    // account.html is already an approved Supabase auth redirect. It forwards
    // recovery tokens here before loading the account application.
    const redirectTo = new URL("account.html", location.href).href;
    const { error } = await client.auth.resetPasswordForEmail(
      $("recoveryEmail").value.trim(), { redirectTo }
    );
    if (error) {
      message("recoveryMessage", error.message, true);
      button.disabled = false;
      return;
    }
    localStorage.setItem("dexleRecoveryPending", "1");
    message("recoveryMessage", "If that email belongs to a Dexle account, a recovery link is on its way. Check your inbox and spam folder.");
    $("recoveryEmail").value = "";
    button.disabled = false;
  };

  $("recoveryResetForm").onsubmit = async event => {
    event.preventDefault();
    const password = $("recoveryPassword").value;
    const confirm = $("recoveryPasswordConfirm").value;
    if (password !== confirm) {
      message("resetMessage", "The passwords do not match.", true);
      return;
    }
    const button = $("recoverySave");
    button.disabled = true;
    const { error } = await client.auth.updateUser({ password });
    if (error) {
      message("resetMessage", error.message, true);
      button.disabled = false;
      return;
    }
    message("resetMessage", "Password updated. Signing you in…");
    setTimeout(() => { location.href = "account.html"; }, 700);
  };

  client.auth.onAuthStateChange((event, session) => {
    // Run profile work after Supabase releases its internal auth lock.
    if (event === "PASSWORD_RECOVERY" && session?.user) {
      setTimeout(() => { showReset(session.user); }, 0);
    }
  });

  if (linkError) {
    localStorage.removeItem("dexleRecoveryPending");
    message("recoveryMessage", "This recovery link is invalid or expired. Request a new one.", true);
  } else if (recoveryLink) {
    setTimeout(() => {
      if ($("recoveryReset").hidden) {
        message("recoveryMessage", "This recovery link is invalid or expired. Request a new one.", true);
      }
    }, 2500);
  }
})();
