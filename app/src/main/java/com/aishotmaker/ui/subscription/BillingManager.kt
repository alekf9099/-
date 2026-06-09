package com.aishotmaker.ui.subscription

import android.app.Activity
import android.content.Context
import com.android.billingclient.api.*
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

@Singleton
class BillingManager @Inject constructor(
    @ApplicationContext private val context: Context
) : PurchasesUpdatedListener {

    private var billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(this)
        .enablePendingPurchases()
        .build()

    private var onPurchaseSuccess: ((String) -> Unit)? = null

    override fun onPurchasesUpdated(
        billingResult: BillingResult,
        purchases: List<Purchase>?
    ) {
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    onPurchaseSuccess?.invoke(purchase.purchaseToken)
                    acknowledgePurchase(purchase)
                }
            }
        }
    }

    fun launchBillingFlow(
        activity: Activity,
        productId: String,
        onSuccess: (String) -> Unit
    ) {
        onPurchaseSuccess = onSuccess
        ensureConnected {
            val productDetails = queryProductDetails(productId)
            productDetails?.let {
                val flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(
                        listOf(
                            BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(it)
                                .build()
                        )
                    )
                    .build()
                billingClient.launchBillingFlow(activity, flowParams)
            }
        }
    }

    fun launchSubscriptionFlow(
        activity: Activity,
        productId: String,
        onSuccess: () -> Unit
    ) {
        launchBillingFlow(activity, productId) { onSuccess() }
    }

    private fun ensureConnected(onConnected: () -> Unit) {
        if (billingClient.isReady) {
            onConnected()
            return
        }
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    onConnected()
                }
            }
            override fun onBillingServiceDisconnected() {}
        })
    }

    private fun queryProductDetails(productId: String): ProductDetails? = null

    private fun acknowledgePurchase(purchase: Purchase) {
        if (purchase.isAcknowledged) return
        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()
        billingClient.acknowledgePurchase(params) {}
    }
}
