package dev.missioncontrol.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SecureCredentialStore {
  private static final String ALIAS = "mission-control-mobile-credential-v1";
  private static final String PREFS = "mission-control-secure";
  private final SharedPreferences preferences;
  SecureCredentialStore(Context context) { preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  private SecretKey key() throws Exception {
    KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
    if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
    KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
    return generator.generateKey();
  }

  void save(String value) throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
    byte[] bytes = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
    preferences.edit().putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)).putString("value", Base64.encodeToString(bytes, Base64.NO_WRAP)).apply();
  }
  String load() throws Exception {
    String iv = preferences.getString("iv", null), value = preferences.getString("value", null); if (iv == null || value == null) return null;
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
    return new String(cipher.doFinal(Base64.decode(value, Base64.NO_WRAP)), StandardCharsets.UTF_8);
  }
  void clear() { preferences.edit().clear().apply(); }
}
