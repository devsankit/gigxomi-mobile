package com.gigxomi.app

import android.os.Handler
import android.os.Looper
import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import java.util.concurrent.atomic.AtomicBoolean

class GigxomiInstallReferrerModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "GigxomiInstallReferrer"

  @ReactMethod
  fun read(promise: Promise) {
    val finished = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())
    var client: InstallReferrerClient? = null
    var timeout: Runnable? = null
    fun finish(result: WritableMap?) {
      if (!finished.compareAndSet(false, true)) return
      timeout?.let { handler.removeCallbacks(it) }
      try { client?.endConnection() } catch (_: Exception) { }
      promise.resolve(result ?: Arguments.createMap().apply { putString("status", "unavailable") })
    }
    timeout = Runnable { finish(null) }
    handler.postDelayed(timeout!!, 5000)
    try {
      client = InstallReferrerClient.newBuilder(reactApplicationContext).build()
      client!!.startConnection(object : InstallReferrerStateListener {
        override fun onInstallReferrerSetupFinished(responseCode: Int) {
          if (finished.get()) return
          if (responseCode != InstallReferrerClient.InstallReferrerResponse.OK) { finish(null); return }
          try {
            val details = client!!.installReferrer
            finish(Arguments.createMap().apply {
              putString("status", "available")
              putString("referrer", details.installReferrer.take(2048))
              putDouble("installStartedAtSeconds", details.installBeginTimestampSeconds.toDouble())
            })
          } catch (_: Exception) { finish(null) }
        }
        override fun onInstallReferrerServiceDisconnected() { finish(null) }
      })
    } catch (_: Exception) { finish(null) }
  }
}
