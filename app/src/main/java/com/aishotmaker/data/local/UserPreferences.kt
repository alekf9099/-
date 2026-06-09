package com.aishotmaker.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "user_prefs")

@Singleton
class UserPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore

    companion object {
        private val KEY_AUTH_TOKEN = stringPreferencesKey("auth_token")
        private val KEY_CREDITS = intPreferencesKey("credits")
        private val KEY_FIRST_LAUNCH = booleanPreferencesKey("first_launch")
        private val KEY_USER_ID = stringPreferencesKey("user_id")
    }

    fun getToken(): String? = runBlocking {
        dataStore.data.first()[KEY_AUTH_TOKEN]
    }

    fun saveToken(token: String) = runBlocking {
        dataStore.edit { it[KEY_AUTH_TOKEN] = token }
    }

    fun clearToken() = runBlocking {
        dataStore.edit { it.remove(KEY_AUTH_TOKEN) }
    }

    fun getCredits(): Int = runBlocking {
        dataStore.data.first()[KEY_CREDITS] ?: 5
    }

    fun saveCredits(credits: Int) = runBlocking {
        dataStore.edit { it[KEY_CREDITS] = credits }
    }

    fun isFirstLaunch(): Boolean = runBlocking {
        dataStore.data.first()[KEY_FIRST_LAUNCH] ?: true
    }

    fun setFirstLaunchDone() = runBlocking {
        dataStore.edit { it[KEY_FIRST_LAUNCH] = false }
    }
}
