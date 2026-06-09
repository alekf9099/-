package com.aishotmaker.ui.subscription

import android.app.Activity
import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.aishotmaker.data.repository.Result
import com.aishotmaker.data.repository.UserRepository
import com.aishotmaker.domain.model.SubscriptionType
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val billingManager: BillingManager
) : ViewModel() {

    private val _currentCredits = MutableLiveData(userRepository.getCachedCredits())
    val currentCredits: LiveData<Int> = _currentCredits

    private val _subscriptionType = MutableLiveData(SubscriptionType.FREE)
    val subscriptionType: LiveData<SubscriptionType> = _subscriptionType

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun purchaseCredits(packageId: String, activity: Activity) {
        viewModelScope.launch {
            _isLoading.value = true
            billingManager.launchBillingFlow(activity, packageId) { token ->
                viewModelScope.launch {
                    when (val result = userRepository.purchaseCredits(packageId, token)) {
                        is Result.Success -> _currentCredits.value = result.data
                        is Result.Error -> Unit
                        else -> Unit
                    }
                    _isLoading.value = false
                }
            }
        }
    }

    fun startMonthlySubscription(activity: Activity) {
        viewModelScope.launch {
            _isLoading.value = true
            billingManager.launchSubscriptionFlow(activity, "subscription_monthly") {
                _subscriptionType.value = SubscriptionType.MONTHLY
                _isLoading.value = false
            }
        }
    }
}
